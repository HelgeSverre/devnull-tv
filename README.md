# /dev/null on TV

[![Samsung Tizen TV](https://img.shields.io/badge/Samsung-Tizen%20TV-1428A0.svg)](https://developer.samsung.com/smarttv/develop)
[![Tested on Tizen 6.0](https://img.shields.io/badge/tested%20on-Tizen%206.0%20(2021)-555.svg)](#compatibility)
[![No build step](https://img.shields.io/badge/build%20step-none-7aa2f7.svg)](app)
[![For dev-null.sh](https://img.shields.io/badge/for-dev--null.sh-111112.svg)](https://github.com/nunomaduro/dev-null.sh)
[![MIT license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A big-screen client for [dev-null.sh](https://dev-null.sh), the social network for developers
([source](https://github.com/nunomaduro/dev-null.sh)), packaged as a Samsung Tizen TV app. It
reads the site's public, read-only API, so it needs no login: the log shows commits from the
developers you add on the TV, drawn the way the site draws them, as a `git log --graph`.

![The Log on a 1920×1080 TV: a graph rail with lane-colored nodes, the focused commit highlighted, and an aside previewing its author](docs/screenshot-log.png)

## Why a separate app

The site itself can't run on these TVs. Their web engine is an older Chromium that can't handle
the site's Tailwind 4 stylesheet, so it loads as a giant unstyled logo. This app is plain HTML, CSS and ES2017 with the fonts bundled, and talks only to the
public API.

## Screens

| Screen | What it shows |
|---|---|
| **Log** | Commits from everyone on this TV, newest first on one graph rail, with day markers, `HEAD@{last visit}`, and a "↑ N new commits" pill when the minute poll finds more. The aside previews the focused author. |
| **Commit** | The full commit with its link card and images, the parent when it is a reply, and a QR code that opens it on your phone for replying or starring. |
| **Profile** | Avatar with lane ring, mirrored GitHub details, counts, the public activity graph, and Commits / Replies tabs. |
| **Image viewer** | Full-screen images, stepping through a commit's images. |
| **People** | The TV's own follow list: add a GitHub username (checked against the API first) or remove one. Stored on the TV. |
| **Ambient** | After two idle minutes, or on PLAY, the latest commits one at a time, large enough to read from the sofa. CH ▲▼ browses them; any other key returns. |
| **About** | Data source, refresh rate and the TV's web engine version. |

### Remote keys

| Key | Does |
|---|---|
| ▲ ▼ | Move between commits (on the commit page: scroll) |
| ◀ ▶ | ◀ opens the menu; on a commit, move between author, link and images; on a profile's tabs, switch tabs |
| OK | Open the focused commit, author, link (in the TV's browser) or image |
| CH ▲ ▼ | Jump 5 commits; on the commit page, previous / next commit; in ambient mode, newer / older commit |
| PLAY | Ambient mode |
| BACK | Back; on the log, exit |

## Install on your TV

Samsung TVs only install apps signed with a Samsung certificate made for that TV, and only in
Developer Mode. Setting that up takes about 15 minutes once. These steps are for macOS; Linux is
the same apart from the installer file.

You need: [just](https://github.com/casey/just), Node 18+, and the TV and your computer on the
same network.

**1. Turn on Developer Mode on the TV.** Open **Apps** and enter `1 2 3 4 5` (with an on-screen
number pad if your remote has no number keys). Switch Developer Mode **On**, enter your computer's IP address as
Host PC IP, then restart the TV by holding the power button until the logo appears.

**2. Install the Tizen Studio command-line tools** (no IDE needed):

```sh
curl -O https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_macos-64.bin
chmod +x web-cli_Tizen_Studio_6.1_macos-64.bin
./web-cli_Tizen_Studio_6.1_macos-64.bin --accept-license ~/tizen-studio
~/tizen-studio/package-manager/package-manager-cli.bin install --accept-license cert-add-on
```

If the package manager says the JDK is missing, an earlier failed run left an empty
`~/.package-manager/jdk` folder behind: remove it with `rmdir ~/.package-manager/jdk` and run the
command again.

**3. Copy out Samsung's TV CA certificates.** They ship inside the certificate extension:

```sh
mkdir -p ~/tizen-studio-data/samsung-ca
unzip -j ~/tizen-studio/tools/certificate-manager/Certificate-manager.app/Contents/Eclipse/plugins/org.tizen.common.cert_*.jar \
  res/ca/vd_tizen_dev_author_ca.cer res/ca/vd_tizen_dev_public2.crt -d ~/tizen-studio-data/samsung-ca
```

**4. Connect to the TV and read its device ID (DUID).** The sdb server dies when started in the
background on some setups, so run it in its own terminal:

```sh
just sdb-server                 # terminal 1, leave it running
TV=192.168.1.20:26101 just connect
~/tizen-studio/tools/sdb shell 0 getduid
```

**5. Get your Samsung certificate.** [samsung-tv-cert](https://github.com/titlog/samsung-tv-cert)
signs you in to a free Samsung account in the browser and writes an author and a distributor
certificate for your TV:

```sh
npx samsung-tv-cert@1.0.0 --duid <YOUR-DUID> --profile devnull-tv
```

**6. Register the certificates as a signing profile:**

```sh
C=~/tizen-studio-data/SamsungCertificate/devnull-tv
CA=~/tizen-studio-data/samsung-ca
PW="$(cat ~/.samsung-tv-cert-password)"
~/tizen-studio/tools/ide/bin/tizen security-profiles add -n devnull-tv -A \
  -a "$C/author.p12" -p "$PW" -d "$C/distributor.p12" -dp "$PW" \
  -dc "$CA/vd_tizen_dev_public2.crt" -c "$CA/vd_tizen_dev_author_ca.cer"
~/tizen-studio/tools/ide/bin/tizen cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
```

**7. Build, install and launch:**

```sh
TV=192.168.1.20:26101 just deploy
```

It shows up in the TV's app list as **dev-null.sh**. `just deploy` re-signs and reinstalls after
any change; `TIZEN_PROFILE` picks a different signing profile.

## Development

There is no build step: `app/` is the whole app, and `just package` signs it into
`build/dev-null.sh.wgt`.

```sh
just preview    # open app/index.html in desktop Chrome at 1920×1080 against the live API
just deploy     # sign, install and launch on the TV
just run        # launch the installed app
```

Desktop Chrome is fine for layout work, but it is far newer than the TV's engine. Keep to what the
TV supports:

- **JavaScript:** ES2017. No `?.`, `??`, private class fields or top-level `await`.
- **CSS:** no `gap` on flex containers (grid `gap` is fine), `inset`, `aspect-ratio`, `:has()`,
  `oklch()` or cascade layers.
- **Text:** every commit body, name and bio goes through `textContent`, never `innerHTML`.

`design/screens.html` is the design document the app was built from: every screen at 1920×1080
with real commits, following dev-null.sh's [design system](https://github.com/nunomaduro/dev-null.sh/blob/main/DESIGN.md).

## How it works

- **Data:** `GET /api/v1/users/{u}`, `/api/v1/users/{u}/commits` (and `?replies=1`),
  `/api/v1/commits/{id}`, and the public activity graph at `/@{u}/graph.svg?theme=dark`. The API
  has no global feed, which is why the log is built from the people you add.
- **Lane colors** use the site's automatic hash of the user id (`User::automaticLane`). The API
  doesn't expose a lane someone picked in Settings, so those people show their automatic color.
- **Links** open in the TV's own browser through `tizen.application.launchAppControl`.
- **Keys** like PLAY and the channel buttons are registered with `tizen.tvinputdevice`.

## Compatibility

Tested on a Samsung QE55Q65AAUXXC (2021, Tizen 6.0); other Tizen TVs are untested. Not yet
confirmed on that TV: opening links in the TV's browser and typing a username on the People
screen. The About screen shows the TV's web engine version, which helps when reporting problems.

If the app installs but shows only a black screen, the package's `config.xml` is the likely
cause: during development, an app name containing `/` and a `tizen:allow-navigation` element
both coincided with a black screen on this TV. Keep `config.xml` close to Samsung's template, as
`app/config.xml` is.

## Credits

- [dev-null.sh](https://github.com/nunomaduro/dev-null.sh) by Nuno Maduro and contributors: the
  name, logo, design system and API. This app is unofficial.
- [Geist and Geist Mono](https://vercel.com/font) by Vercel, under the SIL Open Font License
  (`app/fonts/OFL.txt`).
- [qrcodejs](https://github.com/davidshimjs/qrcodejs) by Shim Sangmin, MIT license.

The app's own code is [MIT](LICENSE). The dev-null.sh logo in `app/icon.png` belongs to
dev-null.sh, whose repository has no license; it is used here as the TV app icon.
