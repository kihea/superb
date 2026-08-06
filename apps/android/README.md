# apps/android

The Android app is the web app, installed. This is a Trusted Web Activity:
a thin native shell that opens https://superb.works/read/ full screen, with
the same offline behaviour the installed web app already has. There is no
duplicated product code in here, just one dependency and a manifest.

## Build

You need a JDK (17 or later), Gradle 8.13 or later, and the Android SDK
(install Android Studio, or the command-line tools with platform 36).

```sh
cd apps/android
gradle assembleRelease        # or: gradle bundleRelease for a Play upload
```

The debug build (`gradle assembleDebug`) installs and runs as it is. It shows
a browser address bar until the site's association is in place, which is the
next section.

CI builds both variants on every change under `apps/android/`, so a build
break shows up without anyone having to have an SDK installed. The release
variant it builds is unsigned.

## Versions

| | | |
|---|---|---|
| Android Gradle plugin | 8.13.0 | the first 8.x line that compiles against API 36 |
| `compileSdk` / `targetSdk` | 36 | Google Play requires API 36 for anything submitted from 31 August 2026 |
| `minSdk` | 21 | what `androidbrowserhelper` supports |
| `androidbrowserhelper` | 2.7.2 | the whole of the native side |

## Making the address bar disappear (release)

A Trusted Web Activity runs full screen only when the site and the app prove
they belong to each other. The app's half is already in the manifest. The
site's half is `apps/site/page/.well-known/assetlinks.json`, which ships with
an empty fingerprint list because the release keystore is not in this
repository.

1. Sign the release build with your key: set a `signingConfig` in
   `app/build.gradle`, or sign in CI.
2. Print the key's SHA-256 fingerprint:
   ```sh
   keytool -list -v -keystore your-release-key.keystore -alias your-alias
   ```
3. Put that fingerprint into the empty list in
   `apps/site/page/.well-known/assetlinks.json`:
   ```json
   "sha256_cert_fingerprints": ["AA:BB:…"]
   ```
4. Deploy the site. Android checks the pair when the app is installed and
   drops the address bar.

If you upload through Google Play with Play App Signing, the fingerprint you
need is the one Play shows under Release, Setup, App signing. That is not the
same key as your upload key, and the upload key is the wrong one here.

Until step 3 is done the association fails closed: the app works and shows an
address bar, rather than claiming an association it cannot prove.

## iOS

Later. The web app already installs from Safari's share sheet in the
meantime.
