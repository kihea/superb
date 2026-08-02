# apps/android

The Android app is the web app, installed. This is a Trusted Web Activity:
a thin native shell that opens https://superb.works/read/ full screen, with
the same offline behaviour the installed web app already has. There is no
duplicated product code in here — one dependency and a manifest.

## Build

You need a JDK (17+) and the Android SDK (install Android Studio, or the
command-line tools with platform 34).

```sh
cd apps/android
gradle assembleRelease        # or: gradle bundleRelease for a Play upload
```

The debug build (`gradle assembleDebug`) installs and runs as-is; it shows
a browser bar until the site's association is in place (below).

## Making the browser bar disappear (release)

A Trusted Web Activity runs full screen only when the site and the app
prove they belong to each other.

1. Sign the release build with your key (set a `signingConfig` in
   `app/build.gradle`, or sign in CI).
2. Print the key's SHA-256 fingerprint:
   ```sh
   keytool -list -v -keystore your-release-key.keystore
   ```
3. Put that fingerprint in `assetlinks.json` at
   `apps/site/page/.well-known/assetlinks.json`:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "works.superb.app",
       "sha256_cert_fingerprints": ["AA:BB:…"]
     }
   }]
   ```
4. Deploy the site. Android verifies the pair on install and drops the bar.

## iOS

Later. The web app already installs from Safari's share sheet in the
meantime.
