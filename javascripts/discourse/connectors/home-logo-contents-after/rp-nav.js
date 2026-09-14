export default {
  // Mounted right next to the brand mark (home-logo-contents-before,
  // confirmed working on a live install) rather than the `header-icons`
  // outlet, which turned out not to render in the visible header bar on
  // at least one Discourse version.
  shouldRender() {
    return settings.show_custom_header_nav && !document.querySelector(".rp-header-nav");
  },

  setupComponent(args, component) {
    component.set("settings", settings);
  },
};
