export default {
  // Confirmed via a live install's rendered DOM: Discourse's header
  // (.d-header .contents) lays out as
  //   home-logo-wrapper-outlet | before-header-panel-outlet | .panel
  // in a flex row, so this outlet sits naturally between the logo and
  // the icon buttons — no absolute-positioning trick needed. Earlier
  // guesses (`header-icons`, `home-logo-contents-before/after`) never
  // matched any real outlet on that install.
  shouldRender() {
    return settings.show_custom_header_nav && !document.querySelector(".rp-header-nav");
  },

  setupComponent(args, component) {
    component.set("settings", settings);
  },
};
