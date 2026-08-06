# .well-known

`assetlinks.json` is how superb.works tells Android that the app signed with
our release key is allowed to open the site full screen. Without it, the
Android app still runs, but it shows a browser address bar across the top.

The file ships with an empty `sha256_cert_fingerprints` list, because the
fingerprint belongs to the release keystore and the keystore is not in this
repository. Until it is filled in, the association fails closed: the app
falls back to the address bar rather than claiming an association it cannot
prove.

To finish it, once, with the release keystore to hand:

```sh
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

Copy the SHA-256 line, which looks like `AA:BB:CC:...`, into the list:

```json
"sha256_cert_fingerprints": ["AA:BB:CC:..."]
```

Then deploy the site. Android checks the pair when the app is installed and
drops the address bar.

If you upload to Google Play with Play App Signing, use the fingerprint Play
shows under Release, Setup, App signing, not the one from your upload key.
Those are different keys, and the upload key is the wrong one here.
