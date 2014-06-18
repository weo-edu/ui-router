$ParallelStateProvider.$inject = [ ];
function $ParallelStateProvider() {
  // Holds all the states which are inactivated.  Inactivated states can be either parallel states, or descendants of parallel states.
  var inactiveStates = {}; // state.name -> (state)
  var parallelStates = {}; // state.name -> true
  var lastSubstate = {}, lastParams = {};
  var $state;
  var nullTransition = { toState: null, toParams: null, fromState: null, fromParams: null };

  // Called by $stateProvider.registerState();
  // registers a parallel state with $parallelStateProvider
  this.registerParallelState = function(state) {
    parallelStates[state.name] = state;
    if (state.deepStateRedirect)
      lastSubstate[state.name] = state.name;
  };

  // Because I decoupled $parallelState from $state, and $state injects $parallelState, I can't simply inject $state here.
  // Instead, $stateProvider calls this kludge function to provide us with $state.  I see this as temporary.  When more
  // eyes look at this setup, we'll figure out a better way.  Perhaps just merge all the parallestate stuff into $state,
  // since they're really at the same conceptual level.
  this.kludgeProvideState = function($_state) {
    $state = $_state;
  };

  this.$get = [ '$rootScope', '$injector', function ($rootScope, $injector) {
//  this.$get = [ '$rootScope', '$state', function ($rootScope, $state) {
    // Intercept state transitions directly to the tab, and instead switch to the last known substate
    $rootScope.$on("$stateChangeStart", function (evt, toState, toParams, fromState, fromParams) {
      parallelSupport.currentTransition = { toState: toState, toParams: toParams, fromState: fromState, fromParams: fromParams };

      if (lastSubstate[toState.name] && // Changing directly to one of the "tab" states
              lastSubstate[toState.name] != toState.name) { // Last known state within the tab isn't the tab itself
        // Direct reference to a tab state from outside that tab (the user changed tabs)
        // Instead of sending them to the blank tab state, send them to the last known state for that tab
        evt.preventDefault();
        $state.go(lastSubstate[toState.name], lastParams[toState.name]);
      }
    });

    // Record the last active sub-state
    $rootScope.$on("$stateChangeError", function (evt, toState, toParams, fromState, fromParams) {
      parallelSupport.currentTransition = nullTransition;
    });

    // Record the last active sub-state
    $rootScope.$on("$stateChangeSuccess", function (evt, toState, toParams, fromState, fromParams) {
      parallelSupport.currentTransition = nullTransition;
      // After state change within a tab, record the "to state" as the last known state for that tab.
      for (var state in lastSubstate) {
        if (toState == state || toState.name.indexOf(state + ".") != -1) {
          lastSubstate[state] = toState.name;
          lastParams[state] = angular.copy(toParams);
        }
      }
    });

    var parallelSupport = {
      currentTransition: nullTransition,

      // Main API for $parallelState, used by $state.
      // Processes a potential transition, returns an object with the following attributes:
      // {
      //    inactives: Array of all states which will be inactive if the transition is completed. (both previously and newly inactivated)
      //    enter: Enter transition type for all added states.  This is a parallel array to "toStates" array in $state.transitionTo.
      //    exit: Exit transition type for all removed states.  This is a parallel array to "fromStates" array in $state.transitionTo.
      // }
      processTransition: function(transition) {
        // This object is returned
        var result = { inactives: [], enter: [], exit: [] };
        var     fromPath = transition.fromState.path,
            fromParams = transition.fromParams,
            toPath = transition.toState.path,
            toParams = transition.toParams;
        // Inactive states, before the transition is processed, mapped to the parent parallel state.
        var inactivesByParent = this.getInactiveStatesByParent();

        // Duplicates logic in $state.transitionTo, primarily to find the pivot state (i.e., the "keep" value)
        var keep = 0, state = fromPath[keep];
        while (state && state === fromPath[keep] && equalForKeys(toParams, fromParams, state.ownParams)) {
          state = toPath[++keep];
        }

        if (keep <= 0) return result;

        var idx, reactivatedStates = {}, pType = this.getParallelTransitionType(fromPath, toPath, keep);
        var ancestorUpdated = false; // When ancestor params change, treat reactivation as exit/enter

        // Calculate the "enter" transitions for new states in toPath
        // Enter transitions will be either "enter", "reactivate", or "updateStateParams" where
        //   enter: full resolve, no special logic
        //   reactivate: use previous locals
        //   updateStateParams: like 'enter', except exit the inactive state before entering it.
        for (idx = keep; idx < toPath.length; idx++) {
          var enterTrans = !pType.to ? "enter" : this.getEnterTransition(toPath[idx], transition.toParams, ancestorUpdated);
          ancestorUpdated = (ancestorUpdated || enterTrans == 'updateStateParams');
          result.enter[idx] = enterTrans;
          // If we're reactivating a state, make a note of it, so we can remove that state from the "inactive" list
          if (enterTrans == 'reactivate')
            reactivatedStates[toPath[idx].name] = toPath[idx];
        }

        // Locate currently and newly inactive states (at pivot and above) and store them in the output array 'inactives'.
        for (idx = 0; idx < keep; idx++) {
          var inactiveChildren = inactivesByParent[fromPath[idx].self.name];
          for (var i = 0; inactiveChildren && i < inactiveChildren.length; i++) {
            var child = inactiveChildren[i];
            // Don't organize state as inactive if we're about to reactivate it.
            if (!reactivatedStates[child.name])
              result.inactives.push(child);
          }
        }

        // Calculate the "exit" transition for states not kept, in fromPath.
        // Exit transition can be one of:
        //   exit: standard state exit logic
        //   inactivate: register state as an inactive state
        for (idx = keep; idx < fromPath.length; idx++) {
          var exitTrans = "exit";
          if (pType.from) {
            // State is being inactivated, note this in result.inactives array
            result.inactives.push(fromPath[idx]);
            exitTrans = "inactivate";
          }
          result.exit[idx] = exitTrans;
        }

//      console.log("processTransition: " , result);
        return result;
      },

      // Each inactive states is either a parallel state, or a child of a parallel state.
      // This function finds the closest ancestor parallel state, then find that state's parent.
      // Map all inactive states to their closest parent-to-parallel state.
      getInactiveStatesByParent: function() {
        var mappedStates = {};
        for (var name in inactiveStates) {
          var state = inactiveStates[name];
          var parParents = this.getParallelStateStack(state);
          for (var i = 0; i < parParents.length; i++) {
            var parent = parParents[i].parent;
            if(parent) {
              mappedStates[parent.name] = mappedStates[parent.name] || [];
              mappedStates[parent.name].push(state);
            }
          }
        }
        return mappedStates;
      },

      // Used by processTransition to determine if what kind of parallel state transition this is.
      // returns { from: (bool), to: (bool) }
      getParallelTransitionType: function (fromPath, toPath, keep) {
        if (fromPath[keep] === toPath[keep]) return { from: false, to: false };
        var parallelFromState = keep < fromPath.length && fromPath[keep].self.parallel;
        var parallelToState = keep < toPath.length && toPath[keep].self.parallel;
        return { to: parallelFromState, from: parallelToState };
      },

      // Given a state, returns all ancestor states which are parallel.
      // Walks up the view's state's ancestry tree and locates each ancestor state which is marked as parallel.
      // Returns an array populated with only those ancestor parallel states.
      getParallelStateStack: function (state) {
        var stack = [];
        if (!state) return stack;
        do {
          //if (state.parallel) stack.push(state);
          state = state.parent;
        } while (state);
        stack.reverse();
        return stack;
      },

      // Exits all inactivated descendant substates when the ancestor state is exited.
      // When transitionTo is exiting a state, this function is called with the state being exited.  It checks the
      // registry of inactivated states for descendants of the exited state and also exits those descendants.  It then
      // removes the locals and de-registers the state from the inactivated registry.
      stateExiting: function (exiting) {
        var substatePrefix = exiting.self.name + "."; // All descendant states will start with this prefix
        for (var name in inactiveStates) {
          // TODO: Might need to run the inactivations in the proper depth-first order?
          if (name.indexOf(substatePrefix) === 0) { // inactivated state's name starts with the prefix.
            var inactiveExiting = inactiveStates[name];
            if (inactiveExiting.self.onExit)
              $injector.invoke(inactiveExiting.self.onExit, inactiveExiting.self, inactiveExiting.locals.globals);
            inactiveExiting.locals = null;
            delete inactiveStates[name];
          }
        }
        if (exiting.self.onExit)
          $injector.invoke(exiting.self.onExit, exiting.self, exiting.locals.globals);
        exiting.locals = null;
        delete inactiveStates[exiting.self.name];
      },

      // Adds a state to the inactivated parallel state registry.
      stateInactivated: function (state) {
        // Keep locals around.
        inactiveStates[state.self.name] = state;
        // Notify states they are being Inactivated (i.e., a different
        // parallel state tree is now active).
        if (state.self.onInactivate)
          $injector.invoke(state.self.onInactivate, state.self, state.locals.globals);
      },

      // Removes a previously inactivated state from the inactive parallel state registry
      stateEntering: function(entering, params) {
        var inactivatedState = this.getInactivatedState(entering);
        if (inactivatedState && !this.getInactivatedState(entering, params)) {
          var savedLocals = entering.locals;
          this.stateExiting(inactivatedState);
          entering.locals = savedLocals;
        }
      },

      // Removes a previously inactivated state from the inactive parallel state registry
      stateReactivated: function(state) {
        if (inactiveStates[state.self.name]) {
          delete inactiveStates[state.self.name];
        }
        if (state.self.onReactivate)
          $injector.invoke(state.self.onReactivate, state.self, state.locals.globals);
      },

      // Given a state and (optional) stateParams, returns the inactivated state from the inactive parallel state registry.
      getInactivatedState: function (state, stateParams) {
        var inactiveState = inactiveStates[state.name];
        if (!inactiveState) return null;
        if (!stateParams) return inactiveState;
        var paramsMatch = equalForKeys(stateParams, inactiveState.locals.globals.$stateParams, state.ownParams);
        return paramsMatch ? inactiveState : null;
      },

      // Returns a parallel transition type necessary to enter the state.
      // Transition can be: reactivate, updateStateParams, or enter

      // Note: if a state is being reactivated but params dont match, we treat
      // it as a Exit/Enter, thus the special "updateStateParams" transition.
      // If a parent inactivated state has "updateStateParams" transition type, then
      // all descendant states must also be exit/entered, thus the first line of this function.
      getEnterTransition: function (state, stateParams, ancestorParamsChanged) {
        if (ancestorParamsChanged) return "updateStateParams";
        var inactiveState = inactiveStates[state.name];
        if (!inactiveState) return "enter";
        var paramsMatch = equalForKeys(stateParams, inactiveState.locals.globals.$stateParams, state.ownParams);
        // console.log("getEnterTransition: " + state.name + (paramsMatch ? ": reactivate" : ": updateStateParams"));
        return paramsMatch ? "reactivate" : "updateStateParams";
      }
    };

    return parallelSupport;
  }];
}

// I tried to put $parallelState in 'ui.router.state' where it belongs, but I couldn't get $parallelStateProvider
// to inject into $stateProvider.  By putting it into a dependent module, it injects fine.  Shouldn't I be able to inject
// a provider into another providers in the same module?
angular.module('ui.router.util').provider('$parallelState', $ParallelStateProvider);
