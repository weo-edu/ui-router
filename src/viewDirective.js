/**
 * @ngdoc directive
 * @name ui.router.state.directive:ui-view
 *
 * @requires ui.router.state.$state
 * @requires $compile
 * @requires $controller
 * @requires $injector
 * @requires ui.router.state.$uiViewScroll
 * @requires $document
 *
 * @restrict ECA
 *
 * @description
 * The ui-view directive tells $state where to place your templates.
 *
 * @param {string=} ui-view A view name. The name should be unique amongst the other views in the
 * same state. You can have views of the same name that live in different states.
 *
 * @param {string=} autoscroll It allows you to set the scroll behavior of the browser window
 * when a view is populated. By default, $anchorScroll is overridden by ui-router's custom scroll
 * service, {@link ui.router.state.$uiViewScroll}. This custom service let's you
 * scroll ui-view elements into view when they are populated during a state activation.
 *
 * *Note: To revert back to old [`$anchorScroll`](http://docs.angularjs.org/api/ng.$anchorScroll)
 * functionality, call `$uiViewScrollProvider.useAnchorScroll()`.*
 *
 * @param {string=} onload Expression to evaluate whenever the view updates.
 * 
 * @example
 * A view can be unnamed or named. 
 * <pre>
 * <!-- Unnamed -->
 * <div ui-view></div> 
 * 
 * <!-- Named -->
 * <div ui-view="viewName"></div>
 * </pre>
 *
 * You can only have one unnamed view within any template (or root html). If you are only using a 
 * single view and it is unnamed then you can populate it like so:
 * <pre>
 * <div ui-view></div> 
 * $stateProvider.state("home", {
 *   template: "<h1>HELLO!</h1>"
 * })
 * </pre>
 * 
 * The above is a convenient shortcut equivalent to specifying your view explicitly with the {@link ui.router.state.$stateProvider#views `views`}
 * config property, by name, in this case an empty name:
 * <pre>
 * $stateProvider.state("home", {
 *   views: {
 *     "": {
 *       template: "<h1>HELLO!</h1>"
 *     }
 *   }    
 * })
 * </pre>
 * 
 * But typically you'll only use the views property if you name your view or have more than one view 
 * in the same template. There's not really a compelling reason to name a view if its the only one, 
 * but you could if you wanted, like so:
 * <pre>
 * <div ui-view="main"></div>
 * </pre> 
 * <pre>
 * $stateProvider.state("home", {
 *   views: {
 *     "main": {
 *       template: "<h1>HELLO!</h1>"
 *     }
 *   }    
 * })
 * </pre>
 * 
 * Really though, you'll use views to set up multiple views:
 * <pre>
 * <div ui-view></div>
 * <div ui-view="chart"></div> 
 * <div ui-view="data"></div> 
 * </pre>
 * 
 * <pre>
 * $stateProvider.state("home", {
 *   views: {
 *     "": {
 *       template: "<h1>HELLO!</h1>"
 *     },
 *     "chart": {
 *       template: "<chart_thing/>"
 *     },
 *     "data": {
 *       template: "<data_thing/>"
 *     }
 *   }    
 * })
 * </pre>
 *
 * Examples for `autoscroll`:
 *
 * <pre>
 * <!-- If autoscroll unspecified, then scroll ui-view into view
 *     (Note: this default behavior is under review and may be reversed) -->
 * <ui-view/>
 *
 * <!-- If autoscroll present with no expression,
 *      then scroll ui-view into view -->
 * <ui-view autoscroll/>
 *
 * <!-- If autoscroll present with valid expression,
 *      then scroll ui-view into view if expression evaluates to true -->
 * <ui-view autoscroll='true'/>
 * <ui-view autoscroll='false'/>
 * <ui-view autoscroll='scopeVariable'/>
 * </pre>
 */
$ViewDirective.$inject = ['$state', '$compile', '$controller', '$injector', '$uiViewScroll', '$document'];
function $ViewDirective(   $state,   $compile,   $controller,   $injector,   $uiViewScroll,   $document) {

  function getService() {
    return ($injector.has) ? function(service) {
      return $injector.has(service) ? $injector.get(service) : null;
    } : function(service) {
      try {
        return $injector.get(service);
      } catch (e) {
        return null;
      }
    };
  }

  var viewIsUpdating = false,
      service = getService(),
      $animator = service('$animator'),
      $animate = service('$animate');

  // Returns a set of DOM manipulation functions based on whether animation
  // should be performed
  function getRenderer(element, attrs, scope) {
    var statics = function() {
      return {
        leave: function (element) { element.remove(); },
        enter: function (element, parent, anchor) { anchor.after(element); }
      };
    };

    if ($animate) {
      return function(shouldAnimate) {
        return !shouldAnimate ? statics() : {
          enter: function(element, parent, anchor) { $animate.enter(element, null, anchor); },
          leave: function(element) { $animate.leave(element, function() { element.remove(); }); }
        };
      };
    }

    if ($animator) {
      var animate = $animator && $animator(scope, attrs);

      return function(shouldAnimate) {
        return !shouldAnimate ? statics() : {
          enter: function(element, parent, anchor) { animate.enter(element, parent); },
          leave: function(element) { animate.leave(element.contents(), element); }
        };
      };
    }

    return statics;
  }

  var directive = {
    restrict: 'ECA',
    compile: function (element, attrs) {
      var initial   = element.html(),
          isDefault = true,
          anchor    = angular.element($document[0].createComment(' ui-view-anchor ')),
          parentEl  = element.parent();

      element.prepend(anchor);

      return function ($scope) {
        var inherited = parentEl.inheritedData('$uiView');

        var currentScope, currentEl, viewLocals,
            name      = attrs[directive.name] || attrs.name || '',
            onloadExp = attrs.onload || '',
            autoscrollExp = attrs.autoscroll,
            renderer  = getRenderer(element, attrs, $scope);

//        var elId = '#' + attrs.id + ' ';
        var parallel;
        // Check if this ui-view's name references a direct child parallel state
        if (name.indexOf(".") === 0) {
          if (!inherited || !inherited.state)
            throw new Error("ui-view='" + name + "' indicating substate, but unable to locate parent $uiView or $uiView.state ");
          if (name.indexOf(".", 1) != -1)
            throw new Error("ui-view='" + name + "' illegal substate reference.  Can only reference direct child substates. ");
          // a parallel-state was tagged on the ui-view.  Set up a marker on the $uiView DOM element to
          // reference later, and in nested views.

          // first, build the fully qualified state name (parent-el-state + this ui-view substate reference)
          var parallelState = inherited.state.self.name + name;
          if (!$state.get(parallelState))
            throw new Error("Couldn't find parallel state: " + parallelState);
          // store the state name on the view object (which goes on the ui-view element)
          parallel = parallelState;
          // Reset the view name to empty string, so we don't try to pull a named view in updateView()
          name = '';
        }

        // Get the parallel state name, or the inherited parallel state name
        // If parallel, we need to know which parallel state tree we live in later
        parallel = parallel ? parallel : (inherited ? inherited.parallel : null);

        if (name.indexOf('@') < 0) name = name + '@' + (inherited ? inherited.state.name : '');
        // Store the parallel context from the DOM element to the view object
        var view = { name: name, state: null, parallel: parallel };

        var eventHook = function (evt, toState, toParams) {
          // If we're handling the "state change" event, and we have a parallel context, we may
          // want to exit early, and not recompute which subviews to load. Instead, we want to
          // leave this DOM tree untouched.
          if (parallel && evt.name == '$stateChangeSuccess') {
            var parentStateToParallel = parallel.substring(0, parallel.lastIndexOf('.'));
            // State changed to somewhere below the _parent_ to the parallel state we live in.
            // This means it was either to our parallel state, or
            var stateIncludesParentToSubtree = toState.name.indexOf(parentStateToParallel + ".") === 0;
            var stateIncludesOurSubtreeRoot = toState.name.indexOf(parallel + ".") != -1;
            var stateIsOurSubtreeRoot = toState.name == parallel;
            if (stateIncludesParentToSubtree && !stateIncludesOurSubtreeRoot && !stateIsOurSubtreeRoot) {
              // The state changed to another some other parallel state somewhere OUTSIDE our parallel subtree
//              console.log(elId + "short circuited parallel eventHook(" + name + ")" + " parallel: ", parallel);
              return;
            }
          }

          if (viewIsUpdating) return;
          viewIsUpdating = true;

          try { updateView(true); } catch (e) {
            viewIsUpdating = false;
            throw e;
          }
          viewIsUpdating = false;
        };

        $scope.$on('$stateChangeSuccess', eventHook);
        $scope.$on('$viewContentLoading', eventHook);

        if (parallel && !$state.includes(parallel)) {
          // This block handles the initial updateView call during compile stage.  All other updateView happen
          // via the eventHook callback.

          // I'm not sure how to better handle this.  I don't want updateView to try to load the actual view now because
          // it will load one copy of the '' view for each parallel state defined.  I want updateView to actually run,
          // however, because I want the "default"/"no state loaded" markup rendered. As a hack, I am setting the name
          // to something ridiculous so it isn't found in locals when updateView(false) is called.
          var oldName = name;
          // something that won't match in updateView. Need better way to do this.  Perhaps add an argument to updateView()
          name = '##AASSDDFF.......';
          updateView(false);
          name = oldName;
        } else {
          updateView(false);
        }

        function cleanupLastView() {
          if (currentEl) {
            renderer(true).leave(currentEl);
            currentEl = null;
          }

          if (currentScope) {
            currentScope.$destroy();
            currentScope = null;
          }
          // Nuke the viewLocals in cleanupLastView so they don't get reused in updateView
          viewLocals = null;
        }

        function updateView(shouldAnimate) {
          var locals;
          // If the view is parallel, we may re-activate an inactive view
          if (view.parallel) {
            // When reactivating a parallel state, the locals got re-resolved.  To stop the view
            // from resetting locals and scope, etc, re-use the viewLocals.
            // This logic should probably be moved to resolveState somehow.
            if (viewLocals && $state.includes(view.state.self.name)) { // a viewLocals is sitting around and this view's state is included
              locals = viewLocals; // Reuse viewLocals instead of pulling out of $state.$current
//              console.log(elId+"updateView(" + name + ") parallel; setting locals to viewLocals");
            } else {
              locals = $state.$current && $state.$current.locals[name];
//              console.log(elId+"updateView(" + name + ") parallel; setting locals to $state.$current.locals[name]");
            }
          } else {
            locals = $state.$current && $state.$current.locals[name];
          }

          if (isDefault) {
            isDefault = false;
            element.replaceWith(anchor);
          }

          if (!locals) {
            cleanupLastView();
            currentEl = element.clone();
            currentEl.html(initial);
            renderer(shouldAnimate).enter(currentEl, parentEl, anchor);

            currentScope = $scope.$new();
            $compile(currentEl.contents())(currentScope);
            return;
          }

          if (locals === viewLocals) return; // nothing to do

          cleanupLastView();

          currentEl = element.clone();
          currentEl.html(locals.$template ? locals.$template : initial);
          renderer(true).enter(currentEl, parentEl, anchor);

          currentEl.data('$uiView', view);

          viewLocals = locals;
          view.state = locals.$$state;

          var link = $compile(currentEl.contents());

          currentScope = $scope.$new();

          if (locals.$$controller) {
            locals.$scope = currentScope;
            var controller = $controller(locals.$$controller, locals);
            if ($state.$current.controllerAs) {
              currentScope[$state.$current.controllerAs] = controller;
            }
            currentEl.children().data('$ngControllerController', controller);
          }

          link(currentScope);

          /**
           * @ngdoc event
           * @name ui.router.state.directive:ui-view#$viewContentLoaded
           * @eventOf ui.router.state.directive:ui-view
           * @eventType emits on ui-view directive scope
           * @description           *
           * Fired once the view is **loaded**, *after* the DOM is rendered.
           *
           * @param {Object} event Event object.
           */
          currentScope.$emit('$viewContentLoaded');
          if (onloadExp) currentScope.$eval(onloadExp);

          if (!angular.isDefined(autoscrollExp) || !autoscrollExp || $scope.$eval(autoscrollExp)) {
            $uiViewScroll(currentEl);
          }
        }
      };
    }
  };

  return directive;
}

angular.module('ui.router.state').directive('uiView', $ViewDirective);
