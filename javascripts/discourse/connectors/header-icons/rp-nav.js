export default {
  shouldRender() {
    return settings.show_custom_header_nav;
  },

  setupComponent(args, component) {
    component.set("settings", settings);
  },
};
