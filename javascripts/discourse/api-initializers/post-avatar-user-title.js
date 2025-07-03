import { apiInitializer } from "discourse/lib/api";
import { withSilencedDeprecations } from "discourse/lib/deprecated";
import Badge from "discourse/models/badge";

const cachedBadgeInfo = {
  cachedPromise: null,
  fetchBadgeIcon() {
    if (this.cachedPromise) {
      return this.cachedPromise;
    }
    this.cachedPromise = Badge.findAll().then((badge_list) => {
      const badge_groups_to_show = settings.badge_groups_to_show ?? [];
      const badgeInfoMap = new Map();
      badge_list
        .filter((badge) => {
          return (
            badge.allow_title &&
            badge_groups_to_show.includes(badge.badge_grouping?.name) &&
            badge.image_url
          );
        })
        .forEach((badge) => {
          badgeInfoMap.set(badge.name, badge.image_url);
        });
      return badgeInfoMap;
    });
    return this.cachedPromise;
  },
};

function transformPost(post) {
  cachedBadgeInfo.fetchBadgeIcon().then((badgeIcon) => {
    if (!post.user_title) {
      return;
    }
    const badgeUrl = badgeIcon.get(post.user_title);
    // To display badge on flair:
    // Must have `badgeUrl` AND
    // `settings.override_group_flair` is true OR no original flair
    if (
      badgeUrl &&
      (settings.override_group_flair || !post.flair_group_id || !post.flair_url)
    ) {
      post.flair_name = post.user_title;
      post.flair_url = badgeUrl;
      post.flair_group_id = -1; // flair_group_id must be true to render flair
    }
  });
}

export default apiInitializer("0.11.1", (api) => {
  withSilencedDeprecations("discourse.post-stream-widget-overrides", () =>
    widgetImplementation(api)
  );

  if (settings.block_topic_render_until_badge_loaded) {
    api.modifyClass(
      "route:topic",
      (Superclass) =>
        class extends Superclass {
          afterModel(model) {
            super.afterModel?.(model);
            // the transition will pause until the promise resolves
            return cachedBadgeInfo.fetchBadgeIcon();
          }
        }
    );
  }

  // New glimmer post stream
  api.addTrackedPostProperties("flair_url", "flair_group_id");

  api.modifyClass(
    "model:post-stream",
    (Superclass) =>
      class extends Superclass {
        appendPost(_post) {
          const post = super.appendPost?.(_post);
          transformPost(post);
          return post;
        }

        prependPost(_post) {
          const post = super.prependPost?.(_post);
          transformPost(post);
          return post;
        }
      }
  );
});

function widgetImplementation(api) {
  // For old widget
  // https://meta.discourse.org/t/upcoming-post-stream-changes-how-to-prepare-themes-and-plugins/372063
  let badgeInfoMap = new Map();
  let badgeInfoReady = false;
  const rerenderList = [];

  cachedBadgeInfo.fetchBadgeIcon().then((map) => {
    badgeInfoMap = map;
    badgeInfoReady = true;
    rerenderList.forEach((widget) => widget.scheduleRerender());
  });

  return api.reopenWidget("post-avatar", {
    getUserTitle(attrs) {
      if (attrs.user_title !== undefined) {
        return attrs.user_title;
      }
      return null;
    },
    getTitleImgUrl(attrs) {
      return badgeInfoMap.get(this.getUserTitle(attrs));
    },
    hasTitleImg(attrs) {
      return !!this.getTitleImgUrl(attrs);
    },
    html(attrs, ...args) {
      if (!badgeInfoReady) {
        rerenderList.push(this);
      }
      if (
        (!(attrs.flair_url || attrs.flair_bg_color) ||
          settings.override_group_flair) &&
        this.hasTitleImg(attrs)
      ) {
        attrs.flair_name = this.getUserTitle(attrs);
        attrs.flair_url = this.getTitleImgUrl(attrs);
        if (attrs.flair_url) {
          attrs.flair_group_id = -1;
        }
        let result = this._super(attrs, ...args);
        return result;
      } else {
        return this._super(attrs, ...args);
      }
    },
  });
}
