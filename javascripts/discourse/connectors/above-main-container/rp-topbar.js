import { getOwner } from "@ember/application";
import { htmlSafe } from "@ember/template";

export default {
  shouldRender() {
    return (
      settings.show_banner &&
      settings.banner_image &&
      settings.banner_image.length > 0 &&
      !document.querySelector(".rp-banner")
    );
  },

  setupComponent(args, component) {
    const currentUser = getOwner(component)?.lookup("service:current-user");
    component.setProperties({
      settings,
      showWelcome: settings.banner_show_welcome_text && !!currentUser,
      welcomeName: currentUser?.name || currentUser?.username || "",
      // Built here with the `htmlSafe` JS helper, not the deprecated
      // `{{html-safe}}` template helper (see rp-sidebar.js for the
      // same fix applied to its progress bar / weather marker styles).
      bannerStyle: htmlSafe(`background-image: url(${settings.banner_image})`),
    });
  },
};
