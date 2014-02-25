angular.module('parallel', ['ui.router']);

// States are connected as follows:


//                              root.tabs.people.person
//                                 /  stateParams: id
//                                /
//                      root.tabs.people
//                       /PARALLEL
//                      /
//    root.notabs       /                            root.tabs.S2.i
//     /              /                PARALLEL    /
//  root --- root.tabs --------------- root.tabs.S2 -- root.tabs.S2.ii
//               |   \                              \
//               |    \                              ----root.tabs.S2.iii -- root.tabs.S2.iii.deep -- root.tabs.S2.iii.deep.nest
//               |     \
//               |      \            root.tabs.subtabs.S1
//               |       \                /   PARALLEL
//               |      root.tabs.subtabs
//               |        PARALLEL        \
//               |                   root.tabs.subtabs.S2
//               |                            PARALLEL
//               |
//                \                  root.tabs.outersubtabs.S1
//                 \  (not parallel)    / PARALLEL
//                root.tabs.outersubtabs
//                                      \
//                                   root.tabs.outersubtabs.S1
//                                       PARALLEL


// NESTED PARALLEL STATE SAMPLES
// -----------------------------
// root.notabs: non-parallel "reset" sibling state
//             This state is above the parallel states; activation will exit all active/inactive parallel states

// root.tabs: parent state to the top level of parallel states.  Has a template with tabs/tab control directives.
//            This demonstrates the basic parallel states architecture.  Clicking between tabs changes the state, which
//            the URL reflects, but the DOM is not affected and states are re-activated without being re-resolved.

// root.tabs.people: Demonstrates a parallel state with a resolve function

// root.tabs.people.person: Demonstrates a non-parallel substate which has a parameter

// root.tabs.subtabs: This state is a parallel state which has two child parallel states.
//                    This demonstrates stacked parallel states working at different nest levels.

// root.tabs.outersubtabs: This state is a non-parallel child state of root.tabs.  It has two child parallel states.
//                         This demonstrates exiting of parallel substates when the parent is exited.

// root.tabs.S2: This parallel state has deeply nested states.
//               This mainly demonstrates the tab_controls, where clicking the S2 tab will bring you back to whatever
//               deeply nested state you last activated within the S2 subtree.

angular.module('parallel').config([ '$stateProvider', '$urlRouterProvider', function ($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.otherwise("/");

  // Root state.  Has a standard ui-view which gets loaded with either 'root.notabs' (no tabs) or 'root.tabs' (the tabs list state)
  $stateProvider.state('root', {
    controller: function ($scope, $state, $timeout) {
      $scope.data = 'Some State Data';
      $scope.$on('$stateChangeSuccess', function (arg1, toState, toStateParams) {
        // Save the currently active state (for display in the header)
        $scope.activestate = toState.name;
      })
      timerCtrl($scope, $state, $timeout);
    },
    template: '<h3>Active State: {{activestate}}</h3>' +
            '<div>' +
            '<b>root</b>: Started {{delta}} seconds ago' +
            '<br><input ng-model="data" type="text">{{data}}' +
            '<br>Neither root.tabs nor root.notabs are parallel.   ' +
            '<br>Selecting one of these states will exit all parallel states..' +
            '<br>Go to: ' +
            '  <a ui-sref-active="active" ui-sref=".tabs">tabs</a> / <a ui-sref-active="active" ui-sref=".notabs">non tabs</a>' +
            '  <div id="root_ui-view" ui-view>Nothing Loaded</div>' +
            '</div>',
    url: '/'
  });

  // The top tab list state.  Has four named ui-views.  Uses tab_controls.js to manage state transitions when the tabs are clicked.
  $stateProvider.state('root.tabs', {
    controller: function ($scope, $state, $timeout) {
      timerCtrl($scope, $state, $timeout);
      $scope.isStateActive = function (statename) {
        return $state.includes(statename);
      }
    },
    template: '<b>root.tabs</b>: Started {{delta}} seconds ago' +
            '<br><input ng-model="data" type="text">{{data}}' +
            '<br><input type="checkbox" ng-model="showInactiveTabs">Show inactive tabs' +

            // Here is where we set up the 4 tab controls (the UI for selecting tabs), and use parallel-state-controls
            // to switch to the last known active substate when each tab is clicked.
            '<ul class="tabs" parallel-state-controls>' +
            '   <li ng-class="{ active: isStateActive(\'root.tabs.people\') }" parallel-state-selector=".people">people (Parallel + stateParameter)</li>' +
            '   <li ng-class="{ active: isStateActive(\'root.tabs.S2\') }" parallel-state-selector=".S2">S2 (Parallel)</span>' +
            '   <li ng-class="{ active: isStateActive(\'root.tabs.subtabs\') }" parallel-state-selector=".subtabs">subtabs (Parallel)</span>' +
            '   <li ng-class="{ active: isStateActive(\'root.tabs.outersubtabs\') }" parallel-state-selector=".outersubtabs">outersubtabs (Not parallel)</span>' +
            '</ul>' +

            // Here is where the parallel states are bound to the UI.
            // Note: I had to wrap the ui-view in a div because ng-show doesn't seem to work on a ui-view
            '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.people\')"><div id="root_tabs_ui-view_people" ui-view="people">Nothing Loaded</div></div>' +
            '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.S2\')"><div id="root_tabs_ui-view_S2" ui-view="S2">Nothing Loaded</div></div>' +
            '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.subtabs\')"><div id="root_tabs_ui-view_subtabs" ui-view="subtabs">Nothing Loaded</div></div>' +
            // the state root.tabs.outersubtags is NOT a parallel state.
            '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.outersubtabs\')"><div id="root_tabs_ui-view_outersubtabs" ui-view="outersubtabs">Nothing Loaded</div></div>' +
            '',
    url: 'tabs'
  });

  // A dummy state to demonstrate the tabs state coming and going.  Activating this state will exit root.tabs, and thus
  // exit all currently active or inactivated parallel substates of root.tabs.
  $stateProvider.state('root.notabs', {
    controller: timerCtrl,
    template: '<h4>No tabs here.  Toggling from tabs to notabs exits all substates of tabs.</h4>' +
            '<b>root.notabs</b>: Started {{delta}} seconds ago' +
            '<br><input ng-model="data" type="text">{{data}}',
    url: 'notabs'
  });

  // This state is the first tab with nested states and ui-views
  // It has a simple resolve function defined.
  // The 'people' view plugs into the ui-view="people" like a standard named view.  However, we only provide the single
  // named view.  The other named views in the parent template ("S2", "subtabs", "outersubtabs") are untouched.
  $stateProvider.state('root.tabs.people', {
    views: {
      people: {
        controller: function ($scope, $state, $timeout, people) {
          $scope.people = {};
          angular.forEach(people, function(person) { $scope.people[person.id] = person; });
          timerCtrl($scope, $state, $timeout);
        },
        template: '<b>root.tabs.people</b>: Started {{delta}} seconds ago' +
                '<br><input ng-model="data" type="text">{{data}}' +
                '<br><ul><li ng-repeat="person in people"><a ui-sref=".person({ id: person.id})">{{person.name}}</a></li></ul>' +
                '<div ui-view>Nothing Loaded...</div>'
      }
    },
    resolve: {
      people: function() {
        console.log("resolve: people (root.tabs.S1.people)");
        return [
          { id: 1, name: 'john', occupation: 'dancer' },
          { id: 2, name: 'dick', occupation: 'baker'},
          { id: 3, name: 'sally', occupation: 'banker' },
          { id: 4, name: 'joe', occupation: 'barrista' }
        ]
      }
    },
    scope: true,
    parallel: true, // Parallel state indicator on the state definition
    url: '/people'
  });

  // Nested state with params of root.tabs.people
  // TODO: add a nested parallel state with params.
  $stateProvider.state('root.tabs.people.person', {
    controller: function ($scope, $state, $timeout, $stateParams)  {
      $scope.person = $scope.people[$stateParams.id];
      timerCtrl($scope, $state, $timeout);
    },
    template: '<b>root.tabs.people.person</b>: Started {{delta}} seconds ago' +
            '<br><input ng-model="data" type="text">{{data}}' +
            '<br>{{person.name}} is a {{person.occupation}}',
    url: '/:id'
  });

  // This state is the second parallel state tab.  It has deeply nested non-parallel states
  // Again, we define "parallel: true" and provide a named view, to plug into the parent template's ui-view.
  $stateProvider.state('root.tabs.S2', {
    views: {
      S2: {
        controller: timerCtrl,
        template: '<b>root.tabs.S2</b>: Started {{delta}} seconds ago' +
                '<br><input ng-model="data" type="text"> {{data}}' +
                '<br>Go to non-parallel sub-state: <a ui-sref-active="active" ui-sref=".i">S2.i</a> / ' +
                '<a ui-sref-active="active" ui-sref=".ii">S2.ii</a> / ' +
                '<a ui-sref-active="active" ui-sref=".iii">S2.iii (deep nested states)</a>' +
                '<div id="root_tabs_S2_ui-view" ui-view>Nothing Loaded</div>'
      }
    },
    scope: true,
    parallel: true,
    url: '/s2'
  });

  // This parallel state has another tabs UI and named views. It controls additional parallel states.
  $stateProvider.state('root.tabs.subtabs', {
    views: {
      subtabs: {
        controller: timerCtrl,
        template:
//                '<br>Not Parallel...' +
                'Parallel subtabs...' +
                '<b>root.tabs.subtabs</b>: Started {{delta}} seconds ago' +
                '<br><input ng-model="data" type="text">{{data}}' +
                '<br><input type="checkbox" ng-model="showInactiveTabs">Show inactive tabs' +
                '<ul class="tabs" parallel-state-controls>' +
                '   <li ng-class="{ active: isStateActive(\'root.tabs.subtabs.S1\') }" parallel-state-selector=".S1">subtabs.S1 (Nested Parallel)</li>' +
                '   <li ng-class="{ active: isStateActive(\'root.tabs.subtabs.S2\') }" parallel-state-selector=".S2">subtabs.S2 (Nested Parallel)</span>' +
                '</ul>' +
                // Here is where the parallel states are bound to the UI.
                // Note: Wrap the ui-view in a div because ng-show doesn't seem to work on a ui-view
                '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.subtabs.S1\')"><div id="root_tabs_ui-view_S1" ui-view="S1">Nothing Loaded</div></div>' +
                '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.subtabs.S2\')"><div id="root_tabs_ui-view_S2" ui-view="S2">Nothing Loaded</div></div>' +
                ''
      }
    },
    parallel: true,
    url: '/subtabs'
  });

  // Parallel state to plug into root.tabs.subtabs named ui-view
  $stateProvider.state('root.tabs.subtabs.S1', {
    views: {
      S1: {
        controller: timerCtrl,
        template: '<b>root.tabs.subtabs.S1</b>: Started {{delta}} seconds ago' +
                '<br><input ng-model="data" type="text"><br>{{data}}'
      }
    },
    scope: true,
    parallel: true,
    url: '/s1'
  });

  // Parallel state to plug into root.tabs.subtabs named ui-view
  $stateProvider.state('root.tabs.subtabs.S2', {
    views: {
      S2: {
        controller: timerCtrl,
        template: '<b>root.tabs.subtabs.S2</b>: Started {{delta}} seconds ago' +
                '<input ng-model="data" type="text">' +
                '<br>{{data}}'
      }
    },
    scope: true,
    parallel: true,
    url: '/s2'
  });


  // Yet another state with parallel substates.  This time, however, the state is NOT parallel.  root.tabs.outersubtabs
  // does not define parallel: true.  Thus, when the top level tab is changed away from root.tabs.outersubtabs, this state
  // is exited, and its parallel child substates are also exited.
  $stateProvider.state('root.tabs.outersubtabs', {
    views: {
      outersubtabs: {
        controller:  timerCtrl,
        template:
                '<br>Tabs, but this tabs control state is not parallel...' +
                '<b>root.tabs.outersubtabs</b>: Started {{delta}} seconds ago' +
                '<input ng-model="data" type="text">{{data}}' +
                '<br><input type="checkbox" ng-model="showInactiveTabs">Show inactive tabs' +
                '<ul class="tabs" parallel-state-controls>' +
                '   <li ng-class="{ active: isStateActive(\'root.tabs.outersubtabs.S1\') }" parallel-state-selector=".S1">outersubtabs.S1 (Outer Parallel State 1)</li>' +
                '   <li ng-class="{ active: isStateActive(\'root.tabs.outersubtabs.S2\') }" parallel-state-selector=".S2">outersubtabs.S2 (Outer Parallel State 2)</li>' +
                '</ul>' +
                // Here is where the parallel states are bound to the UI.
                // Note: Wrap the ui-view in a div because ng-show doesn't seem to work on a ui-view
                '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.outersubtabs.S1\')"><div id="root_tabs_ui-view_S1" ui-view="S1">Nothing Loaded</div></div>' +
                '  <div ng-show="showInactiveTabs || isStateActive(\'root.tabs.outersubtabs.S2\')"><div id="root_tabs_ui-view_S2" ui-view="S2">Nothing Loaded</div></div>' +
                ''
      }
    },
    url: '/outersubtabs'
  });

  // Parallel state to plug into root.tabs.outersubtabs named ui-view
  $stateProvider.state('root.tabs.outersubtabs.S1', {
    views: {
      S1: {
        controller: timerCtrl,
        template: '<b>root.tabs.outersubtabs.S1</b>: Started {{delta}} seconds ago' +
                '<input ng-model="data" type="text">' +
                '<br>{{data}}'
      }
    },
    scope: true,
    parallel: true,
    url: '/s1'
  });

  // Parallel state to plug into root.tabs.outersubtabs named ui-view
  $stateProvider.state('root.tabs.outersubtabs.S2', {
    views: {
      S2: {
        controller: timerCtrl,
        template: '<b>root.tabs.outersubtabs.S2</b>: Started {{delta}} seconds ago' +
                '<input ng-model="data" type="text">' +
                '<br>{{data}}'
      }
    },
    scope: true,
    parallel: true,
    url: '/s2'
  });


  // Deeply nested state of root.tabs.S2
  $stateProvider.state('root.tabs.S2.i', {
    controller: timerCtrl,
    template: '<b>root.tabs.S2.i</b>: Started {{delta}} seconds ago' +
            '<input ng-model="data" type="text">{{data}}',
    url: '/i'

  });

  // Deeply nested state of root.tabs.S2
  $stateProvider.state('root.tabs.S2.ii', {
    controller: timerCtrl,
    template: '<b>root.tabs.S2.ii</b>: Started {{delta}} seconds ago' +
            '<input ng-model="data" type="text">{{data}}',
    url: '/ii'

  });

  // Deeply nested state of root.tabs.S2
  $stateProvider.state('root.tabs.S2.iii', {
    controller: timerCtrl,
    template: '<b>root.tabs.S2.iii</b>: Started {{delta}} seconds ago' +
            '<input ng-model="data" type="text">{{data}}' +
            '<br><a ui-sref-active="active" ui-sref=".deep">deep</a>' +
            '<div id="root_tabs_S2_iii_ui-view" ui-view>Nothing Loaded</div>',
    url: '/iii'
  });

  // Deeply nested state of root.tabs.S2
  $stateProvider.state('root.tabs.S2.iii.deep', {
    controller: timerCtrl,
    template: '<b>root.tabs.S2.iii.deep</b>: Started {{delta}} seconds ago' +
            '<input ng-model="data" type="text">{{data}}' +
            '<br><a ui-sref-active="active" ui-sref=".nest">nest</a>' +
            '<div id="root_tabs_S2_iii_deep_ui-view" ui-view>Nothing Loaded</div>',
    url: '/deep'
  });

  // Deeply nested state of root.tabs.S2
  $stateProvider.state('root.tabs.S2.iii.deep.nest', {
    controller: timerCtrl,
    template: '<b>root.tabs.S2.iii.deep.nest</b>: Started {{delta}} seconds ago' +
            '<input ng-model="data" type="text">{{data}}' +
            '<br>',
    url: '/nest'
  });
}]);


// This controller updates a 'delta' variable in the scope which demonstrates how long each scope has been alive.
// In the demo, notice that as you move between tabs, scope (and scope age) is retained
var timerCtrl = function ($scope, $state, $timeout) {
  $scope.start = new Date().getTime();
  $scope.delta = 0;

  var stopped = false;
  var updateTicks = function () {
    $scope.deltaticks = new Date().getTime() - $scope.start;
    $scope.delta = Math.floor($scope.deltaticks / 1000);
    if (!stopped) promise = $timeout(updateTicks, 1000);
  };
  var promise = $timeout(updateTicks, 1000);

  $scope.$on("$destroy", function () {
    $timeout.cancel(promise);
    stopped = true;
  })
};

// Add onEnter, onExit, onInactivate, onReactivate callbacks to all states.
angular.module("parallel").run([ '$rootScope', '$state', '$stateParams',
  function ($rootScope, $state, $stateParams) {
    $rootScope.$state = $state;
    $rootScope.$stateParams = $stateParams;
    angular.forEach($state.get(), function (state) {
      state.onEnter = stateEnter(state);
      state.onExit = stateExit(state);
      state.onInactivate = stateInactivate(state);
      state.onReactivate = stateReactivate(state);
    });
  }
]);

var stateEnter = function(state) {
  return function() {
    console.log("     ENTER: " + state.name);
  }
}
var stateExit = function(state) {
  return function() {
    console.log("      EXIT: " + state.name);
  }
}
var stateInactivate = function(state) {
  return function() {
    console.log("INACTIVATE: " + state.name);
  }
}
var stateReactivate = function(state) {
  return function() {
    console.log("REACTIVATE: " + state.name);
  }
}
