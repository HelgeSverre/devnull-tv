# Publishing to the Samsung TV store

Research notes, checked 2026-10-17. Nothing has been registered or submitted.

## 1. The store and who can publish

- The store is **Samsung Apps TV** (the Apps panel in Smart Hub). Apps reach it through **Samsung Apps TV Seller Office** at [seller.samsungapps.com/tv](https://seller.samsungapps.com/tv/). Sign-in uses a Samsung account. [Becoming Seller Office Members](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html)
- There are two membership levels. [Becoming Seller Office Members](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html), [Becoming Partners](https://developer.samsung.com/smarttv/develop/distribute/seller-office/membership/becoming-partner.html)

| | Public Seller | Partner Seller |
|---|---|---|
| How you get it | Automatic on sign-up | Offline contract with Samsung HQ or a local subsidiary, then a partnership request approved by a Samsung Content Manager |
| Countries | **United States only** | Countries named in the contract |
| Extras | All general Seller Office features | Partner-level APIs, alpha testing on own TVs, dedicated technical support |

- **Individuals can sign up.** The seller-information form says individual accounts need no registration number. [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- **Partnership is the blocker for Norway.** It needs a contract, and partner rights go to a seller group with company information. [Becoming Partners](https://developer.samsung.com/smarttv/develop/distribute/seller-office/membership/becoming-partner.html) Samsung Developer Relations told forum users to launch in the US as a public seller first and become a partner later. Several developers reported that their requests for a Content Manager contact went unanswered. [Samsung forum](https://forum.developer.samsung.com/t/about-smart-tv/6425) Whether Samsung gives a solo, unofficial, free app a partner contract is **unclear**; no source describes the criteria.
- **Fees:** none of the pages checked mentions a sign-up or listing fee. "Free" is one of the three billing options. [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- **The program is open and active.** Jellyfin for Tizen reached the store in February 2026 after about two and a half years of work. The maintainer had to negotiate non-blocking defects with Seller Office, and only some model groups were approved. [jellyfin-tizen #222](https://github.com/jellyfin/jellyfin-tizen/issues/222)

## 2. Account and legal requirements

- **Seller information** per app: seller name, support email, homepage URL, representative name, phone, mailing address, and a registration number (D-U-N-S, VAT, EIN, or Korean business number). Individuals skip the registration number. [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- **Privacy policy URL:** required only if the app collects personal information. It must be in English. [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html), [Registration Q&A](https://developer.samsung.com/tv-seller-office/faq/application-registration.html) This app stores GitHub usernames on the TV and calls a third-party API. A short privacy page is cheap insurance.
- **EU release:** needs a Declaration of Conformity for the European Accessibility Act. [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- **Age rating** and **category** (Information or Lifestyle fit). The content is user-generated, so the rating needs thought. [Registration Q&A](https://developer.samsung.com/tv-seller-office/faq/application-registration.html)
- **Tax/bank details:** needed only for Samsung Checkout. Not needed for a free app.

### Brand and IP

- The TV docs checked state no explicit IP rule. Samsung's Galaxy Store terms require the seller to warrant that the app "does not violate any Samsung or third-party intellectual property rights", and its IP checklist covers trademarks in binaries, descriptions, images and tags. [Galaxy Store terms](https://seller.samsungapps.com/terms/termsAndConditions.as), [IP Infringement Checklist](https://developer.samsung.com/galaxy-store/ip-infringement.html) The TV Seller Office terms allow removal after an "assertion" by a third party (the clause text was cut off in search results; not confirmed). [TV Seller Office terms](https://seller.samsungapps.com/tv/portal/terms?seq=9)
- The app's store title must equal `<name>` in config.xml, today `dev-null.sh`. [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html) The icon is the dev-null.sh logo.
- The [dev-null.sh repository](https://github.com/nunomaduro/dev-null.sh) has no LICENSE file. Its `composer.json` says MIT, but that comes from the Laravel starter kit and does not grant trademark rights.
- **Conclusion:** publishing under dev-null.sh's name and logo needs **written permission from Nuno Maduro**. Without it, rename the app and draw an original icon, and describe it as "an unofficial client for dev-null.sh".

## 3. Certificates

| | What we have | What the store needs |
|---|---|---|
| Author certificate | Samsung author cert from [samsung-tv-cert](https://github.com/titlog/samsung-tv-cert) (same Samsung CA service as Certificate Manager) | A Samsung author cert. **Every update must use the same author cert**, or it counts as a different app. [Creating Certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html) |
| Distributor certificate | Bound to one TV's DUID; installs only on that TV in Developer Mode | Any Samsung distributor cert at the right privilege level. The store re-signs with its own distributor certificate. [CircularUI: Creating Certificates](https://samsung.github.io/Tizen.CircularUI/guide/CreatingCertificates.html) |

- A distributor cert from Certificate Manager is a "pseudo-distributor" certificate; the store replaces it on submission. [CircularUI: Creating Certificates](https://samsung.github.io/Tizen.CircularUI/guide/CreatingCertificates.html)
- The upload must contain a valid `author-signature.xml` and `signature1.xml`. [Registering Applications](https://developer.samsung.com/tv-seller-office/guides/applications/registering-application.html)
- **Privilege levels:** Public (anyone), Partner (Seller Office partners only), Platform (not allowed). An app using partner APIs without permission fails the pre-test. [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html), [Privileges Q&A](https://developer.samsung.com/smarttv/develop/faq/privileges.html)
- **Our privileges are all Public:** `tv.inputdevice` ([Configuring Web Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)), `internet` and `application.launch` ([community privilege list](https://github.com/blimJS/Samsung-development-guide)). A Public distributor cert is enough.
- **Unclear:** whether the samsung-tv-cert author cert is accepted at upload. It comes from the same Samsung service, so it probably is. The safe path is to create a fresh author cert in Certificate Manager (Tizen Studio GUI with the Samsung Certificate Extension) before the first upload, back it up, and use it for every release.

## 4. Technical requirements and certification

**config.xml:** Tizen ID, version `x.y.z` (0–255.0–255.0–65535, higher than any earlier upload), `required_version` in `x.y`, title, and screen size in `<feature>`. Partner-only tags (`tv.channel`, `tvkey.config`, `nodisplay`, and others) fail the pre-test. [Registering Applications](https://developer.samsung.com/tv-seller-office/guides/applications/registering-application.html) Our config.xml has all required fields and no restricted tags.

**Store assets** (uploaded to Seller Office, not in the .wgt): [App Icons and Screenshots](https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html), [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)

| Asset | Spec |
|---|---|
| Icon 1920×1080 | Logo (32-bit PNG, transparent) + background (PNG/JPG), each ≤ 300 KB; keep inside the squircle mask |
| Icon 512×423 | 24-bit PNG, ≤ 300 KB (our `app/icon.png` is 512×512) |
| Screenshots | 4 × 1920×1080 JPG, ≤ 500 KB each |
| Text per language | Title, description ≤ 4,000 chars, ≥ 3 tags |
| App UI Description | PPTX describing screens, flows and every custom remote key |

**Model groups:** chosen per release in Seller Office, not in config.xml. 2021 = Tizen 6.0, 2022 = 6.5, 2023 = 7.0, up to 2026 = 10.0. [TV Model Groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html) Only select years we have tested; each group is certified separately.

**Test cases that apply to us** ([Development Checklist, common](https://developer.samsung.com/smarttv/develop/development-checklist/common.html)):

- CO-GE-01: respond within 30 s. CO-CN-03: show a loading indicator.
- CO-US-05: Back closes popups; on the home page it exits to Smart Hub. (We exit on Back from the log.)
- CO-US-04 / CO-GE-05: Exit key closes the app; relaunch works.
- CO-CN-01/02: show a message on network loss, dismiss it on reconnect, never freeze. (We show "The TV can't reach dev-null.sh…"; verify it clears.)
- CO-US-01, CO-UI-04/07/09: all keys work, focus never disappears, no crash on key mashing.
- CO-GE-03: stays responsive after long runs (ambient mode runs for hours).
- CO-KI-01: IME limits on the People screen.

No fixed memory or launch-time number appears in the checklist.

**Review:** upload → automatic pre-test → release request → basic review → verification test → "Waiting Launch" → "Launched". Failures come back graded A/B/C/Critical. [Distributing Applications](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html), [Certification Defects Q&A](https://developer.samsung.com/tv-seller-office/faq/certification-defects.html) Samsung gives no timeline. [Certification Process Q&A](https://developer.samsung.com/tv-seller-office/faq/certification-process.html) flutter-tizen warns it "may take more than 4 weeks". [flutter-tizen](https://github.com/flutter-tizen/flutter-tizen/blob/master/doc/publish-app.md)

## 5. Automation

- **Packaging and signing can run headless.** Examples: [sourcetoad/tizen-build-action](https://github.com/sourcetoad/tizen-build-action), [tizen-sdk-docker](https://github.com/egorshulga/tizen-sdk-docker).
- **Submission is manual.** No Seller Office API was found; every guide uses the web portal. The [Galaxy Store API](https://developer.samsung.com/galaxy-store/galaxy-store-developer-api.html) is for the phone store only.
- **Realistic scope:** CI builds and signs the .wgt and attaches it to a GitHub Release; a person uploads it and fills in Seller Office.

Pitfalls:

- The Linux CLI installer is 280 MB and installs to about 700 MB. Cache it.
- The package manager fetches its own JDK into `~/.package-manager/jdk`. A failed run leaves an empty folder that breaks the next run (see README). Delete it before retrying.
- On Linux the CLI stores certificate passwords via gnome-keyring, which needs `IPC_LOCK` in Docker. [tizen-sdk-docker](https://github.com/egorshulga/tizen-sdk-docker) One project found `security-profiles add` alone failed with "An error has occurred" and an "Author password:" prompt hung the job. [streamvault #44](https://github.com/christopherklint97/streamvault/pull/44)
- `cert-add-on` is needed only to create certificates and to extract Samsung's CA files. In CI, store the two CA files as secrets instead.
- A build signed with the DUID-bound distributor cert installs only on Helge's TV. It is useless to other users.

Sketch, **untested**:

```yaml
# .github/workflows/wgt.yml (UNTESTED sketch)
name: wgt
on:
  push: { tags: ['v*'] }
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-22.04
    permissions: { contents: write }
    env:
      TIZEN: /home/runner/tizen-studio/tools/ide/bin/tizen
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - id: cache
        uses: actions/cache@v4
        with:
          path: |
            ~/tizen-studio
            ~/.package-manager
          key: tizen-web-cli-6.1-ubuntu
      - if: steps.cache.outputs.cache-hit != 'true'
        run: |
          curl -fsSLO https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_ubuntu-64.bin
          chmod +x web-cli_Tizen_Studio_6.1_ubuntu-64.bin
          ./web-cli_Tizen_Studio_6.1_ubuntu-64.bin --accept-license ~/tizen-studio
      - name: Restore certificates
        env:
          AUTHOR_P12: ${{ secrets.TIZEN_AUTHOR_P12_B64 }}
          DIST_P12: ${{ secrets.TIZEN_DISTRIBUTOR_P12_B64 }}
          AUTHOR_CA: ${{ secrets.SAMSUNG_AUTHOR_CA_B64 }}
          DIST_CA: ${{ secrets.SAMSUNG_DISTRIBUTOR_CA_B64 }}
        run: |
          mkdir -p ~/certs
          echo "$AUTHOR_P12" | base64 -d > ~/certs/author.p12
          echo "$DIST_P12"   | base64 -d > ~/certs/distributor.p12
          echo "$AUTHOR_CA"  | base64 -d > ~/certs/author_ca.cer
          echo "$DIST_CA"    | base64 -d > ~/certs/distributor_ca.crt
      - name: Signing profile
        env: { PW: '${{ secrets.TIZEN_CERT_PASSWORD }}' }
        run: |
          "$TIZEN" security-profiles add -n ci -A \
            -a ~/certs/author.p12 -p "$PW" -d ~/certs/distributor.p12 -dp "$PW" \
            -c ~/certs/author_ca.cer -dc ~/certs/distributor_ca.crt
          "$TIZEN" cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
      - name: Package
        run: |
          "$TIZEN" package -t wgt -s ci -- app
          mkdir -p build && mv app/dev-null.sh.wgt build/
      - if: failure()
        run: cat ~/tizen-studio-data/cli/logs/cli.log || true
      - uses: actions/upload-artifact@v4
        with: { name: wgt, path: build/dev-null.sh.wgt }
      - if: startsWith(github.ref, 'refs/tags/')
        env: { GH_TOKEN: '${{ github.token }}' }
        run: gh release upload "$GITHUB_REF_NAME" build/dev-null.sh.wgt --clobber
```

If the password prompt hangs, run the package step under `expect` with a timeout, or run it inside `dbus-run-session` with an unlocked gnome-keyring.

## 6. What we would need to do

**Blockers** (decide first):

1. **Brand permission.** Ask Nuno Maduro in writing for use of the dev-null.sh name and logo. Without it: rename and redraw the icon.
2. **Market.** A public seller ships to the US only. Norway or the EU needs a partner contract with Samsung, which may not be offered to an individual.
3. **Author certificate.** Pick the author cert that will sign every release, forever. Back it up with its password.

**Work items** (in order):

1. Create a Seller Office account (individual, public seller).
2. Create the release author cert and a Public distributor cert; add a `devnull-store` signing profile.
3. Run the checklist cases above on the 2021 TV; confirm the network message clears and the browser launch works.
4. Make store assets: 1920×1080 icon pair, 512×423 icon, four 1920×1080 screenshots, description, ≥ 3 tags.
5. Write the App UI Description (PPTX), including CH ▲▼, PLAY and ◀ menu behavior.
6. Publish a privacy policy page and a support email.
7. Bump the version, build, upload, fix pre-test failures.
8. Request release for the 2021 model group only; add others after testing.
9. Optional: add the CI workflow for build, sign and release attachment.

## Sources

- [TV Seller Office](https://seller.samsungapps.com/tv/)
- [Becoming Seller Office Members](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html)
- [Becoming Partners](https://developer.samsung.com/smarttv/develop/distribute/seller-office/membership/becoming-partner.html)
- [Membership Q&A](https://developer.samsung.com/tv-seller-office/faq/tv-seller-office-membership.html)
- [Application Publication Process](https://developer.samsung.com/tv-seller-office/application-publication-process.html)
- [Registering Applications](https://developer.samsung.com/tv-seller-office/guides/applications/registering-application.html)
- [Entering Application Information](https://developer.samsung.com/tv-seller-office/guides/applications/entering-application-information.html)
- [Distributing Applications](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html)
- [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html)
- [Registration Q&A](https://developer.samsung.com/tv-seller-office/faq/application-registration.html)
- [Certification Process Q&A](https://developer.samsung.com/tv-seller-office/faq/certification-process.html)
- [Certification Defects Q&A](https://developer.samsung.com/tv-seller-office/faq/certification-defects.html)
- [Development Checklist, common](https://developer.samsung.com/smarttv/develop/development-checklist/common.html)
- [App Icons and Screenshots](https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html)
- [TV Model Groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html)
- [Configuring Web Applications](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)
- [Creating Certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Privileges Q&A](https://developer.samsung.com/smarttv/develop/faq/privileges.html)
- [Tizen.CircularUI: Creating Certificates](https://samsung.github.io/Tizen.CircularUI/guide/CreatingCertificates.html)
- [Galaxy Store terms](https://seller.samsungapps.com/terms/termsAndConditions.as), [IP Infringement Checklist](https://developer.samsung.com/galaxy-store/ip-infringement.html), [Galaxy Store Developer API](https://developer.samsung.com/galaxy-store/galaxy-store-developer-api.html)
- [Samsung forum: About Smart TV](https://forum.developer.samsung.com/t/about-smart-tv/6425)
- [jellyfin-tizen #222](https://github.com/jellyfin/jellyfin-tizen/issues/222)
- [flutter-tizen: publish-app.md](https://github.com/flutter-tizen/flutter-tizen/blob/master/doc/publish-app.md)
- [samsung-tv-cert](https://github.com/titlog/samsung-tv-cert)
- [sourcetoad/tizen-build-action](https://github.com/sourcetoad/tizen-build-action), [egorshulga/tizen-sdk-docker](https://github.com/egorshulga/tizen-sdk-docker), [streamvault PR #44](https://github.com/christopherklint97/streamvault/pull/44)
- [blimJS Samsung development guide](https://github.com/blimJS/Samsung-development-guide)
