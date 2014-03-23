$ParallelStateProvider.$inject = [ '$injector' ];
function $ParallelStateProvider($injector) {
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

  this.$get = [ '$rootScope', function ($rootScope) {
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

    return parallelSupport;
  } ];

  var parallelSupport = {
    currentTransition: nullTransition,

    processTransition: function(transition) {
      var output = { inactives: [], enter: [], exit: [], activeViews: {}, inactiveViews: {} };
      var     fromPath = transition.fromState.path,
              fromParams = transition.fromParams,
              toPath = transition.toState.path,
              toParams = transition.toParams,
//              pivotState = fromPath[keep - 1],
              inactivesByParent = this.getInactiveStatesByParent();
      var keep = 0, state = fromPath[keep];
      while (state && state === fromPath[keep] && equalForKeys(toParams, fromParams, state.ownParams)) {
        keep++;
      }

      if (keep <= 0) return output;
      var idx, pType = this.getParallelTransitionType(fromPath, toPath, keep);

      // Locate currently inactive states (at pivot and above)
      for (idx = 0; idx < keep; idx++) {
        var inactiveChildren = (idx < keep ? inactivesByParent[fromPath[idx].name] : undefined);
        if (inactiveChildren && inactiveChildren.length) {
          for (var i = 0; i < inactiveChildren; i++) {
            output.inactives.push(inactiveChildren[i]);
          }
        }
      }

      var update = false; // When ancestor params change, treat reactivation as exit/enter
      // Calculate the "enter" transitions for new states in toPath
      for (idx = keep; idx < toPath.length; idx++) {
        var enterTrans = !pType.to ? "enter" : this.getEnterTransition(toPath[idx], transition.toParams, update);
        update = update || enterTrans == 'updateStateParams';
        output.enter[idx] = enterTrans;
      }

      // Calculate the "exit" transition for states not kept, in fromPath.
      for (idx = keep; idx < fromPath.length; idx++) {
        var exitTrans = "exit";
        if (pType.from) {
          // State is being inactivated, note this in
          output.inactives.push(fromPath[idx]);
          exitTrans = "inactivate";
        }
        output.exit[idx] = exitTrans;
      }

//      console.log("processTransition - pivot: " + pivotState.name, pivotState, output);
      return output;
    },

    parallelStatesByParent: function() {
      var mappedStates = {};
      for (var name in parallelStates) {
        var pstate = parallelStates[name];
        var parent = pstate.parent;
        mappedStates[parent.name] = mappedStates[parent.name] || [];
        mappedStates[parent.name].push(pstate);
      }
      return mappedStates;
    },

    // All inactive states are parallel, or a child of a parallel state.
    // Finds the closest ancestor parallel state, then find that state's parent.
    // Map each inactive state to its closest parent-to-parallel state.
    getInactiveStatesByParent: function() {
      var mappedStates = {};
      for (var name in inactiveStates) {
        var state = inactiveStates[name];
        var parParents = this.getParallelStateStack(state);
        for (var i = 0; i < parParents.length; i++) {
          var parent = parParents[i].parent;
          mappedStates[parent.name] = mappedStates[parent.name] || [];
          mappedStates[parent.name].push(state);
        }
      }
      return mappedStates;
    },

    // Used by state.js to determine if what kind of parallel state transition this is.
    // returns { from: (bool), to: (bool) }
    getParallelTransitionType: function (fromPath, toPath, keep) {
      if (fromPath[keep] === toPath[keep]) return { from: false, to: false };
      var parallelFromState = keep < fromPath.length && fromPath[keep].self.parallel;
      var parallelToState = keep < toPath.length && toPath[keep].self.parallel;
      return { from: parallelFromState, to: parallelToState };
    },

    // Detects and returns whether the state transition is changing to a state on a peered parallel subtree
    isEventInParallelSubtree: function (state, evt, toState, scope, el) {
      // var elid = el && el.length && el[0].nextSibling && el[0].nextSibling.id;
      var parallelArray = parallelSupport.getParallelStateStack(state);
      if (parallelArray.length && (evt.name == '$stateChangeSuccess' || evt.name == '$viewContentLoading')) {
        // Check if the state is changing to a different sibling parallel subtree.  If there are more than one parallel state
        // definitions in this path (when walking up the state tree towards root), then check for sibling parallel subtrees at each "fork"
        toState = toState || this.currentTransition.toState;
        for (var i = 0; i < parallelArray.length; i++) {
          var parallel = parallelArray[i].name;
          var parentStateToParallel = parallel.substring(0, parallel.lastIndexOf('.'));
          // State changed to somewhere below the _parent_ to the parallel state we live in.
          var stateIncludesParentToSubtree =
                  (parentStateToParallel === "" || toState.name.indexOf(parentStateToParallel + ".") === 0);

          var stateIncludesOurSubtreeRoot = toState.name.indexOf(parallel + ".") != -1;
          var stateIsOurSubtreeRoot = toState.name == parallel;
          if (stateIncludesParentToSubtree && !stateIncludesOurSubtreeRoot && !stateIsOurSubtreeRoot) {
            // The state changed to another some other parallel state somewhere OUTSIDE our parallel subtree
            // console.log("short circuited ui-view updateView #" + elid + " toState: " + toState.name);
            return true;
          }
        }
      }
      return false;
    },

    // Given a state, returns all ancestor states which are parallel.
    // Walks up the view's state's ancestry tree and locates each ancestor state which is marked as parallel.
    // Returns an array populated with only those ancestor parallel states.
    getParallelStateStack: function (state) {
      var stack = [];
      if (!state) return stack;
      do {
        if (state.parallel) stack.push(state);
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
        // TODO: run inactivations in the proper order.
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
    // TODO: Need to account for re-activation of a state, where stateParams have changed.
    getInactivatedState: function (state, stateParams) {
      var inactiveState = inactiveStates[state.name];
      if (!inactiveState) return null;
      if (!stateParams) return inactiveState;
      var paramsMatch = equalForKeys(stateParams, inactiveState.locals.globals.$stateParams, state.ownParams);
      return paramsMatch ? inactiveState : null;
    },

    // Returns a parallel transition type necessary to enter the state.
    // Transition can be: reactivate, updateStateParams, or null

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
}

// I tried to put $parallelState in 'ui.router.state' where it belongs, but I couldn't get $parallelStateProvider
// to inject into $stateProvider.  By putting it into a dependent module, it injects fine.  Shouldn't I be able to inject
// a provider into another providers in the same module?
angular.module('ui.router.util').provider('$parallelState', $ParallelStateProvider);
