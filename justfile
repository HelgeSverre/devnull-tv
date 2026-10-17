# /dev/null on TV: Tizen web app for dev-null.sh.

TIZEN := env_var('HOME') / "tizen-studio/tools/ide/bin/tizen"
SDB := env_var('HOME') / "tizen-studio/tools/sdb"
TV := env_var_or_default("TV", "192.168.10.170:26101")
PROFILE := env_var_or_default("TIZEN_PROFILE", "devnull-tv")

default:
    @just --list --unsorted

# Sign app/ into build/dev-null.sh.wgt with the Samsung certificate profile.
[group('build')]
package:
    {{TIZEN}} package -t wgt -s {{PROFILE}} -- app
    mkdir -p build
    mv app/dev-null.sh.wgt build/
    rm -f app/author-signature.xml app/signature1.xml app/.manifest.tmp

[group('build')]
clean:
    rm -rf build app/author-signature.xml app/signature1.xml app/.manifest.tmp

# Package, install on the TV and launch it.
[group('tv')]
deploy: package
    {{TIZEN}} install -s {{TV}} --name dev-null.sh.wgt -- build
    {{TIZEN}} run -s {{TV}} -p DvNullSh01.DevNull

# Launch the installed app.
[group('tv')]
run:
    {{TIZEN}} run -s {{TV}} -p DvNullSh01.DevNull

# Connect sdb; the server must already run (`just sdb-server` in another terminal).
[group('tv')]
connect:
    {{SDB}} connect {{TV}}
    {{SDB}} devices

# Run the sdb server in the foreground; a backgrounded one gets killed on this Mac.
[group('tv')]
sdb-server:
    {{SDB}} fork-server server

# Open the app in desktop Chrome at TV size for quick layout checks.
[group('dev')]
preview:
    open -a "Google Chrome" --args --window-size=1920,1080 "file://{{justfile_directory()}}/app/index.html"
