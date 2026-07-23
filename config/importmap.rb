# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js", preload: true
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"

# Controllers are lazy-loaded on demand (see app/javascript/controllers/index.js), so most of
# them don't need a <link rel="modulepreload"> hint competing with CSS/fonts for first paint.
# Keep preload only for the controllers wired up on the root layout itself
# (app/views/layouts/shared/_htmldoc.html.erb), which are therefore present on every page.
pin_all_from "app/javascript/controllers", under: "controllers", preload: false
pin "controllers/theme_controller", preload: true
pin "controllers/viewport_controller", preload: true
pin "controllers/hotkey_controller", preload: true

pin_all_from "app/components", under: "controllers", to: ""
pin_all_from "app/javascript/services", under: "services", to: "services"
pin_all_from "app/javascript/utils", under: "utils", to: "utils"
pin "@github/hotkey", to: "@github--hotkey.js", preload: false # @3.1.1
pin "@simonwep/pickr", to: "@simonwep--pickr.js", preload: false # @1.9.1

# D3 packages — only pulled in by chart controllers (time_series_chart, sankey_chart,
# donut_chart), which are lazy-loaded. Not needed for first paint on any page, so don't preload.
pin "d3", preload: false # @7.9.0
pin "d3-array", to: "shims/d3-array-default.js", preload: false
pin "d3-axis", preload: false # @3.0.0
pin "d3-brush", preload: false # @3.0.0
pin "d3-chord", preload: false # @3.0.1
pin "d3-color", preload: false # @3.1.0
pin "d3-contour", preload: false # @4.0.2
pin "d3-delaunay", preload: false # @6.0.4
pin "d3-dispatch", preload: false # @3.0.1
pin "d3-drag", preload: false # @3.0.0
pin "d3-dsv", preload: false # @3.0.1
pin "d3-ease", preload: false # @3.0.1
pin "d3-fetch", preload: false # @3.0.1
pin "d3-force", preload: false # @3.0.0
pin "d3-format", preload: false # @3.1.0
pin "d3-geo", preload: false # @3.1.1
pin "d3-hierarchy", preload: false # @3.1.2
pin "d3-interpolate", preload: false # @3.0.1
pin "d3-path", preload: false # @3.1.0
pin "d3-polygon", preload: false # @3.0.1
pin "d3-quadtree", preload: false # @3.0.1
pin "d3-random", preload: false # @3.0.1
pin "d3-scale", preload: false # @4.0.2
pin "d3-scale-chromatic", preload: false # @3.1.0
pin "d3-selection", preload: false # @3.0.0
pin "d3-shape", to: "shims/d3-shape-default.js", preload: false
pin "d3-time", preload: false # @3.1.0
pin "d3-time-format", preload: false # @4.1.0
pin "d3-timer", preload: false # @3.0.1
pin "d3-transition", preload: false # @3.0.1
pin "d3-zoom", preload: false # @3.0.0
pin "delaunator", preload: false # @5.0.1
pin "internmap", preload: false # @2.0.3
pin "robust-predicates", preload: false # @3.0.2
pin "@floating-ui/dom", to: "@floating-ui--dom.js", preload: false # @1.7.0
pin "@floating-ui/core", to: "@floating-ui--core.js", preload: false # @1.7.0
pin "@floating-ui/utils", to: "@floating-ui--utils.js", preload: false # @0.2.9
pin "@floating-ui/utils/dom", to: "@floating-ui--utils--dom.js", preload: false # @0.2.9
pin "d3-sankey", preload: false # @0.12.3
pin "d3-array-src", to: "d3-array.js", preload: false
pin "d3-shape-src", to: "d3-shape.js", preload: false
