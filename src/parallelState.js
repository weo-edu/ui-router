$ParallelStateProvider.$inject = [ '$injector' ];
function $ParallelStateProvider($injector) {
  var inactiveStates = {}; // state.name -> { locals: .., stateParams: .., ownParams: .. }
  var parallelStates = {}; // state.name -> active/inactive

  this.registerParallelState = function(state) {
    parallelStates[state.name] = false;
  };

  this.$get = function () {
    return parallelSupport;
  };

  var parallelSupport = {
    isChangeInParallelUniverse: function (view, evt, toState) {
      // If we're handling the "state change" event, and we have a parallel context, we may
      // want to exit early, and not recompute which subviews to load. Instead, we want to
      // leave the DOM tree untouched for this view.
      var parallelArray = parallelSupport.getParallelStateStack(view);
      if (parallelArray.length && evt.name == '$stateChangeSuccess') {
        // Check if the state is changing to a different sibling parallel subtree.  If there are more than one parallel state
        // definitions in this path (when walking up the state tree towards root), then check for sibling parallel subtrees at each "fork"
        for (var i = 0; i < parallelArray.length; i++) {
          var parallel = parallelArray[i];
          var parentStateToParallel = parallel.substring(0, parallel.lastIndexOf('.'));
          // State changed to somewhere below the _parent_ to the parallel state we live in.
          var stateIncludesParentToSubtree = toState.name.indexOf(parentStateToParallel + ".") === 0;

          var stateIncludesOurSubtreeRoot = toState.name.indexOf(parallel + ".") != -1;
          var stateIsOurSubtreeRoot = toState.name == parallel;
          if (stateIncludesParentToSubtree && !stateIncludesOurSubtreeRoot && !stateIsOurSubtreeRoot) {
            // The state changed to another some other parallel state somewhere OUTSIDE our parallel subtree
//              console.log(elId + "short circuited parallel eventHook(" + name + ")" + " parallel: ", parallel);
            return true;
          }
        }
      }
      return false;
    },
    getParallelStateStack: function (view) {
      var stack = [];
      if (!view || !view.state) return stack;
      var stateNameComponents = view.state.self.name.split(".");
      var name;
      for (var i = 0; i < stateNameComponents.length; i++) {
        var partial = stateNameComponents[i];
        name = (name ? name + "." + partial : partial);
        if (parallelStates[name] !== undefined) {
          stack.push(name);
        }
      }
      return stack;
    },
    stateExiting: function (state) {
      var substatePrefix = state.self.name + ".";
      for (var key in inactiveStates) {
        if (key.indexOf(substatePrefix) === 0) {
          var exitedParallelState = inactiveStates[key];
          if (exitedParallelState.self.onExit) {
            $injector.invoke(exitedParallelState.self.onExit, exitedParallelState.self, exitedParallelState.locals.globals);
          }
          exitedParallelState.locals = null;
          delete inactiveStates[key];
        }
      }
    },
    stateInactivated: function (state) {
      // Keep locals around.
      inactiveStates[state.self.name] = state;
      // Notify states they are being Inactivated (i.e., a different
      // parallel state tree is now active).
      if (state.self.onInactivate) {
        $injector.invoke(state.self.onInactivate, state.self, state.locals.globals);
      }
    },
    stateReactivated: function(state) {
      if (inactiveStates[state.self.name]) {
        delete inactiveStates[state.self.name];
      }
      if (state.self.onReactivate) {
        $injector.invoke(state.self.onReactivate, state.self, state.locals.globals);
      }
    },
    getInactivatedState: function (state, stateParams) {
      var inactiveState = inactiveStates[state.name];
      if (!inactiveState) return null;
      return (equalForKeys(stateParams, inactiveState.locals.globals.$stateParams, state.ownParams)) ? inactiveState : null;
    }
  };
}

// I tried to put $parallelState in 'ui.router.state' where it belongs, but I couldn't get $parallelStateProvider
// to inject into $stateProvider.  By putting it into a dependent module, it injects fine.  Shouldn't I be able to inject
// a provider into another providers in the same module?
angular.module('ui.router.util').provider('$parallelState', $ParallelStateProvider);
