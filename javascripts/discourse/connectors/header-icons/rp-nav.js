export default {
  shouldRender() {
    return settings.show_custom_header_nav && !document.querySelector(".rp-header-nav");
  },

  setupComponent(args, component) {
    component.set("settings", settings);
  },
};
