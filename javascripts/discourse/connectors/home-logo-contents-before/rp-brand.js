export default {
  setupComponent(args, component) {
    component.setProperties({
      settings,
      logoUrl: settings.brand_logo && settings.brand_logo.length ? settings.brand_logo : null,
    });
    // Only hide the native logo once our replacement has actually mounted,
    // so an outlet-name change in a future Discourse version can never
    // leave the header without any logo at all.
    document.body.classList.add("rp-brand-active");
  },

  teardownComponent() {
    document.body.classList.remove("rp-brand-active");
  },
};
