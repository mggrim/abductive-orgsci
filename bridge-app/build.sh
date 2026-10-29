#!/bin/bash
# Build, sign, package and (when it can) notarise Abductive Bridge.
#
#   bridge-app/build.sh
#   SIGN_IDENTITY="Developer ID Application: …" NOTARY_PROFILE=abductive bridge-app/build.sh
#
# SIGN_IDENTITY   The codesigning identity. Default: a "Developer ID Application"
#                 identity in the keychain if there is one, else an "Apple
#                 Development" one. Development-signed builds run on this Mac only.
# NOTARY_PROFILE  A notarytool keychain profile. With a Developer ID identity, the
#                 DMG is notarised and stapled; without one, it is skipped.
#
# Output: bridge-app/build/Release/Abductive Bridge.app and
# bridge-app/build/AbductiveBridge.dmg. The DMG must stay under 20 MB, since
# Cloudflare Pages serves files up to 25 MiB.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

SIGN_IDENTITY="${SIGN_IDENTITY:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
APP_NAME="Abductive Bridge"
BUILD="$HERE/build"
APP="$BUILD/Release/$APP_NAME.app"
DMG="$BUILD/AbductiveBridge.dmg"
ENTITLEMENTS="$HERE/AbductiveBridge/AbductiveBridge.entitlements"
MAX_DMG_BYTES=$((20 * 1024 * 1024))

step() { printf '\n==> %s\n' "$*"; }

step "Unit tests (BridgeCore)"
swift test --package-path BridgeCore 2>&1 | tail -n 3

step "Generate the Xcode project"
xcodegen generate --quiet

step "Build Release (arm64 and x86_64)"
xcodebuild -project AbductiveBridge.xcodeproj -scheme AbductiveBridge -configuration Release \
  -destination "generic/platform=macOS" -derivedDataPath "$BUILD/dd" ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO build -quiet
rm -rf "$BUILD/Release"
mkdir -p "$BUILD/Release"
ditto "$BUILD/dd/Build/Products/Release/$APP_NAME.app" "$APP"

step "Bundle the site"
# M57: the app serves Abductive on its own origin, from a mirror of the hosted
# site or, offline, from this copy of the repo's build. The copy goes in before
# signing so the signature seals it, and is checked file by file against the
# build's site-files.json.
(cd "$HERE/.." && bun run build >/dev/null)
mkdir -p "$APP/Contents/Resources/site"
rsync -a --delete --exclude AbductiveBridge.dmg --exclude .DS_Store "$HERE/../dist/" "$APP/Contents/Resources/site/"
bun "$HERE/../scripts/site-manifest.ts" --verify "$APP/Contents/Resources/site"

step "Choose the signing identity"
identities="$(security find-identity -v -p codesigning || true)"
if [ -z "$SIGN_IDENTITY" ]; then
  SIGN_IDENTITY="$(printf '%s\n' "$identities" | sed -n 's/.*"\(Developer ID Application[^"]*\)".*/\1/p' | head -n 1)"
fi
if [ -z "$SIGN_IDENTITY" ]; then
  SIGN_IDENTITY="$(printf '%s\n' "$identities" | sed -n 's/.*"\(Apple Development[^"]*\)".*/\1/p' | head -n 1)"
fi
if [ -z "$SIGN_IDENTITY" ]; then
  echo "No codesigning identity in the keychain. Set SIGN_IDENTITY, or add one in Xcode's account settings." >&2
  exit 1
fi
case "$SIGN_IDENTITY" in
  "Developer ID Application"*) DISTRIBUTABLE=1; TIMESTAMP="--timestamp" ;;
  *) DISTRIBUTABLE=0; TIMESTAMP="--timestamp=none" ;;
esac
echo "Signing with: $SIGN_IDENTITY"
# The Team ID is the certificate's organisational unit. The parenthesised code in
# an Apple Development certificate's name is a per-person identifier, not the
# team, and notarytool wants the team.
TEAM_ID="$(security find-certificate -c "$SIGN_IDENTITY" -p 2>/dev/null |
  openssl x509 -noout -subject 2>/dev/null | sed -nE 's/.*OU ?= ?([A-Z0-9]{10}).*/\1/p' | head -n 1)"
TEAM_ID="${TEAM_ID:-<team id>}"
echo "Team ID: $TEAM_ID"

step "Sign with hardened runtime"
# Nested code first: the Swift back-deployment library Xcode embeds for macOS
# 14 arrives signed by Apple's team, and notarisation wants every binary in the
# bundle under the one Developer ID with hardened runtime.
if [ -d "$APP/Contents/Frameworks" ]; then
  find "$APP/Contents/Frameworks" -type f \( -name '*.dylib' -o -perm -u+x \) -print0 |
    while IFS= read -r -d '' nested; do
      codesign --force --options runtime $TIMESTAMP --sign "$SIGN_IDENTITY" "$nested"
    done
fi
codesign --force --options runtime --entitlements "$ENTITLEMENTS" $TIMESTAMP --sign "$SIGN_IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"
codesign -d --entitlements - --xml "$APP" >/dev/null

step "Package the DMG"
STAGE="$BUILD/dmg-stage"
rm -rf "$STAGE" "$DMG"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/$APP_NAME.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG" -quiet
rm -rf "$STAGE"
if [ "$DISTRIBUTABLE" = 1 ]; then
  codesign --force $TIMESTAMP --sign "$SIGN_IDENTITY" "$DMG"
fi

NOTARISED=0
if [ -n "$NOTARY_PROFILE" ]; then
  if [ "$DISTRIBUTABLE" = 1 ]; then
    step "Notarise and staple"
    xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG"
    NOTARISED=1
  else
    echo "NOTARY_PROFILE is set, but Apple notarises only Developer ID signed apps; skipping notarisation."
  fi
fi

step "Result"
bytes="$(stat -f %z "$DMG")"
echo "App: $APP"
echo "DMG: $DMG ($bytes bytes, $(awk "BEGIN { printf \"%.1f\", $bytes / 1048576 }") MB)"
if [ "$bytes" -ge "$MAX_DMG_BYTES" ]; then
  echo "The DMG is 20 MB or more; Cloudflare Pages will not serve it reliably." >&2
  exit 1
fi
echo "Signed: $SIGN_IDENTITY (hardened runtime)"
if [ "$NOTARISED" = 1 ]; then
  echo "Notarised and stapled: ready to publish as public/AbductiveBridge.dmg."
  exit 0
fi

if [[ "$SIGN_IDENTITY" == Developer\ ID\ Application:* ]]; then
cat <<STEPS

Signed for distribution, not yet notarised. One step, once: store notarisation
credentials in the keychain, with an App Store Connect API key

  xcrun notarytool store-credentials <profile> --key <AuthKey_XXXX.p8> --key-id <XXXX> --issuer <issuer id>

or with an app-specific password from account.apple.com

  xcrun notarytool store-credentials <profile> --apple-id <id> --team-id $TEAM_ID --password <app-specific password>

Then run: NOTARY_PROFILE=<profile> bridge-app/build.sh
STEPS
else
cat <<STEPS

Not yet distributable. The build runs on this Mac; another Mac's Gatekeeper
will refuse it until it is Developer ID signed and notarised. Two steps, once:

  1. Create a Developer ID Application certificate: in Xcode, Settings >
     Accounts > (team $TEAM_ID) > Manage Certificates > + > Developer ID
     Application, or at developer.apple.com > Certificates.

  2. Store notarisation credentials in the keychain, with an App Store Connect
     API key or an app-specific password from account.apple.com:

       xcrun notarytool store-credentials <profile> --key <AuthKey_XXXX.p8> --key-id <XXXX> --issuer <issuer id>
       xcrun notarytool store-credentials <profile> --apple-id <id> --team-id $TEAM_ID --password <app-specific password>

Then run: NOTARY_PROFILE=<profile> bridge-app/build.sh
STEPS
fi
exit 0
