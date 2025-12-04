import { apiInitializer } from "discourse/lib/api";
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
