// This directive sets up a parallel state controller (i.e., tabs) which manages clicks to the state selector (tabs).
// Instead of going directly to a parallel "tab state" (i.e., tabs.tab1), go to the last known activated substate beneath
// the parallel "tab state" (i.e., tabs.tab1.user.edit)
angular.module('parallel').directive("parallelStateControls", [ '$state',
// parallel-state-controls
  function ($state) {
    var directive = {
      restrict: 'EA',
      transclude: true,
      scope: true,
      template: '<div ng-transclude></div>',
      controller: function ($scope) {
        // Parallel states: last-known-substate management.
        // Register each parallel state, map to its last known active substate
        var lastSubstates = { };
        var lastParams = { };
        // This function is used in parallel-state-selector.link
        this.registerParallelState = function (parallelStateSubtreeRoot) {
          // "Last known substate" defaults to the tab state itself upon registering
          lastSubstates[parallelStateSubtreeRoot] = parallelStateSubtreeRoot;
        };
        // Intercept state transitions directly to the tab, and instead switch to the last known substate
        $scope.$on("$stateChangeStart", function (evt, toState, toParams, fromState, fromParams) {
          if (lastSubstates[toState.name] // Changing directly to one of the "tab" states
                  && lastSubstates[toState.name] != toState.name) { // Last known state within the tab isn't the tab itself
            // Direct reference to a tab state from outside that tab (the user changed tabs)
            // Instead of sending them to the blank tab state, send them to the last known state for tha tab
            evt.preventDefault();
            $state.go(lastSubstates[toState.name], lastParams[toState.name]);
          }
        });

        // Record the last active sub-state
        $scope.$on("$stateChangeSuccess", function (evt, toState, toParams, fromState, fromParams) {
          // After state change within a tab, record the "to state" as the last known state for that tab.
          for (var parallelState in lastSubstates) {
            if (toState == parallelState || toState.name.indexOf(parallelState + ".") != -1) {
              lastSubstates[parallelState] = toState.name;
              lastParams[parallelState] = angular.copy(toParams);
            }
          }
        });

        $scope.isActive = function (state) {
          return $state.includes(state);
        };

      }
    };
    return directive;
  }
]);

// This directive sets up a clickable link which sends you to the last active substate within a parallel state tree.
angular.module('parallel').directive("parallelStateSelector", [ '$state',
// parallel-state-selector
  function ($state) {
    var directive = {
      restrict: 'EA',
      transclude: true,
      scope: {},
      require: "^parallelStateControls",
      template: '<a style="cursor: pointer" ng-click="go()"><span ng-transclude/></a>',
      link: function (scope, elm, attrs, parentController) {
        // Get parent ui-view, pull its state (to determine what our relative state reference means)
        var inherited = elm.inheritedData('$uiView');
        if (!inherited || !inherited.state)
          throw new Error("Couldn't find inherited $uiView data");

        var attr = attrs[directive.name];
        var parallelState = inherited.state + attr;

        if (!attr || attr.indexOf(".") !== 0 || attr.indexOf(".", 1) != -1)
          throw new Error("parallel-state-selector should be set to a dot notation direct child state name ('.substate') but was '" + attr + "'");
        if (!$state.get(parallelState))
          throw new Error("Could not find state named: " + parallelState);
        if (!parentController.registerParallelState)
          throw new Error("parallel-state-selector must have a parent directive parallel-state-controls");

        scope.parallelState = parallelState;
        scope.stateComponent = parallelState.substring(parallelState.lastIndexOf(".") + 1);
        // Register this parallel state root with the parent directive (parallel-state-controls)
        parentController.registerParallelState(parallelState);
        // I can't get this function to be used by ng-class when using this directive.  ng-class is using
        // the transcluded scope.  How can I do this?
        scope.isActive = function () {
          return $state.includes(scope.parallelState);
        };
      },
      controller: function ($scope) {
        // Helper function to emulate nested ui-sref-active so the tabs are highlighted when a substate is active
        // Can't use ui-sref in directive
        // See: https://github.com/angular-ui/ui-router/issues/900
        $scope.go = function () {
          return $state.go($scope.parallelState);
        };
        // I can't get this function to be used by ng-class when using this directive.  ng-class is using
        // the transcluded scope.  How can I do this?
        $scope.isActive = function () {
          return $state.includes($scope.parallelState);
        };

      }
    };
    return directive;
  }
]);
