// Import and register all your controllers from the importmap under controllers/*

import { application } from "controllers/application";

// Lazy load controllers as they appear in the DOM (remember not to preload controllers in import map!)
// Only pages that actually render a `data-controller="..."` attribute for a given controller
// will fetch/execute its module — pages without a chart, for example, never pull in d3.
import { lazyLoadControllersFrom } from "@hotwired/stimulus-loading";
lazyLoadControllersFrom("controllers", application);
