export default {
  // Confirmed real outlet name via a live install's rendered DOM (it
  // wraps <div class="title"> in a div.home-logo-wrapper-outlet) —
  // `home-logo-contents-before` never matched anything real. On sites
  // that already have a custom uploaded logo image (with any branding
  // baked into the image itself), this connector is redundant and can
  // be disabled — it exists for sites using the plain text/icon logo.
  //
  // Defensive: if this outlet ever fires more than once for the same
  // page render, only the first instance mounts. Also fully skippable
  // via show_custom_brand for sites (like this one) that already have
  // their own uploaded logo image and don't want it replaced.
  shouldRender() {
    return settings.show_custom_brand && !document.querySelector(".rp-brand");
  },

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
