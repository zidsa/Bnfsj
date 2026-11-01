import { initialize } from "./product/product-runtime.js";

// Vitrin's asset host serves classic scripts without module CORS headers.
// Keep source modules reusable; the package ships one bundled browser entry.
const root = document.querySelector("[data-bnfsj-product]");
window.bnfsjProductInitialize = initialize;
if (root) window.bnfsjProduct = initialize(root);
