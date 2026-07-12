const mediaViews = new Set(["editor", "profile"]);
const operatorViews = new Set(["admin", "users", "adminInvite", "audit"]);

export function needsMediaContext(view: string) {
  return mediaViews.has(view);
}

export function needsOperatorContext(view: string) {
  return operatorViews.has(view);
}
