// eslint-disable-next-line no-unused-vars
import User from "discourse/models/user";
import Badge from "discourse/models/badge";
import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.11.1", (api) => {
  const badgeInfoMap = new Map();
  let badgeInfoReady = false;
  const rerenderList = [];
  const badge_groups_to_show = settings.badge_groups_to_show ?? [];

  Badge.findAll().then(badge_list => {
    badge_list.filter((badge) => {
      return badge.allow_title && badge_groups_to_show.includes(badge.badge_grouping?.name) && badge.image_url;
    }).forEach((badge) => {
      badgeInfoMap.set(badge.name, badge.image_url);
    });
    badgeInfoReady = true;
    rerenderList.forEach((widget) => widget.scheduleRerender());
  });

  const reopenWidgetList = ["post-avatar"];
  if (settings.show_on_topic_participant) {
    reopenWidgetList.push("topic-participant");
  }

  reopenWidgetList.forEach( function (widgetName) {
    return api.reopenWidget(widgetName, {
      getUserTitle(attrs) {
        if (attrs.user_title !== undefined) {
          return attrs.user_title;
        } else if (attrs.username !== undefined) {
          // 保险起见，先去掉这部分
          // const widget = this;
          // User.findByUsername(attrs.username).then((user) => {
          //   attrs.user_title = user.title;
          //   widget.scheduleRerender();
          // });
        }
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
        if ((!(attrs.flair_url || attrs.flair_bg_color) || settings.override_group_flair) && this.hasTitleImg(attrs)) {
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
  });
});
