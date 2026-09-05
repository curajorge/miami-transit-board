# Google Play release checklist

Status: Android prototype for direct device testing. Not published on Google Play. This list is a release plan, not certification or a promise of approval.

## Product and reliability

- [ ] Validate outbound and return trips on real journeys, including service outages and late-night service.
- [ ] Resolve service-hours validation and clearly document the lack of transfer planning.
- [ ] Validate walking and ride-time assumptions; do not present straight-line walking as routed directions.
- [ ] Test map tiles and upstream feed availability, rate limits, attribution, and permitted distribution use.
- [ ] Review TalkBack, text scaling, contrast, small screens, keyboard handling, and Android navigation.
- [ ] Test current supported Android versions and multiple WebView versions, including system dark mode.

## Packaging and ownership

- [ ] Confirm the permanent application ID, store name, developer identity, and support contact.
- [ ] Review the target API requirement in Play Console at submission time; the current build targets API 35.
- [ ] Configure an owner-controlled upload key and signed release Android App Bundle; enroll in Play App Signing as applicable.
- [ ] Back up signing material securely outside Git. Do not reuse the debug signing key for release.
- [ ] Increment version codes, disable debugging, and test the actual release build.

## Privacy and store listing

- [ ] Publish a maintained privacy-policy URL and expose it in the app before submission.
- [ ] Complete Data safety from actual behavior, including network requests to map/transit providers and any deployment logging—not just Android permission counts.
- [ ] Keep the independent/unofficial status prominent. Do not imply City of Miami or Miami-Dade endorsement.
- [ ] Prepare accurate store descriptions, support details, content rating, icon, feature graphic, and current release screenshots.
- [ ] Complete the testing and production-access requirements shown for the owner's Play account.
- [ ] Review Play's pre-launch report, then stage rollout with a rollback/support plan.

Current design has no account system, advertising or analytics SDK, and requests only Internet permission. Appearance, saved trips (including selected location coordinates), and the last trip are stored locally. Map and transit providers receive network requests; this still requires a privacy review before publication. Feedback collection remains future work and must be explicitly opt-in if added.

## Official submission references

Requirements change: check these again when preparing the release.

- [Play testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334)
- [Android app signing](https://developer.android.com/studio/publish/app-signing)
- [Google Play policy center](https://play.google/developer-content-policy/)
