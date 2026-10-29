# Expo and package evaluation

The project pins the **Expo SDK 55** release line and uses `expo install` to align native
package versions with its bundled compatibility table. It deliberately does not follow
an unpinned latest SDK during a short hackathon. The lockfile captures installed versions.

| Dependency | Decision and limits |
| --- | --- |
| `expo-sqlite` | Native durable SQLite with async queries and transactions. Data survives restarts. Android is the target. Web SQLite support is experimental and is not claimed as a supported deliverable. |
| `expo-camera` | `CameraView` QR scanner with explicit permission flow. Camera denied/unavailable has a paste fallback. No obsolete `expo-barcode-scanner` dependency. |
| `react-native-qrcode-svg` + `react-native-svg` | Generates a bounded, single-report QR locally. No network request to an external QR service. |
| `expo-location` | Foreground GPS capture only; manual location works when permission is denied or GPS is unavailable. No background tracking. |
| `expo-crypto` | Random report/event IDs, random report ownership tokens, and SHA-256 ownership hashes. |
| `expo-secure-store` | Stores session credentials using platform secure storage. Incident database encryption is outside this MVP. |
| `react-native-safe-area-context` | Keeps controls clear of Android system insets. Native React Native controls provide scalable text and accessibility labels. |
| `vitest` + `node:sqlite` | Unit/integration verification with a real SQLite engine through the repository adapter; Node 22.14+ or 24 recommended. |

No Bluetooth libraries, background-task guarantees, obsolete barcode modules or fake
mesh transport are included. Sync is explicitly driven by app foreground checks and
manual action; a reachable API is the test of connectivity. A Wi-Fi icon alone is not
evidence that a report has been delivered.

Official references consulted on 29 October 2026:

* [Expo SDK 55 reference and platform versions](https://docs.expo.dev/versions/v55.0.0/)
* [Expo SQLite: persistence, transactions, and web caveats](https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/)
* [Expo Camera: CameraView and QR scanning](https://docs.expo.dev/versions/v55.0.0/sdk/camera/)
* [Expo Location: permissions and foreground geolocation](https://docs.expo.dev/versions/v55.0.0/sdk/location/)
* [Expo SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)
* [Expo Crypto](https://docs.expo.dev/versions/v55.0.0/sdk/crypto/)

The APIs used are included in compatible Expo Go releases. Preview APK generation
still requires EAS or an Android native build toolchain. An exported Android JavaScript
bundle validates bundling; it does not replace a physical-device smoke test or create an APK.

## Installed and checked

Delivered lockfile: Expo **55.0.32**, React Native **0.83.10**, React **19.2.0**,
TypeScript **5.9.x**, Vitest **5.0.5**. Expo's online compatibility check passes.
An explicit optional Windows Rolldown binding avoids npm's missing-optional-dependency
problem for the test runner on Windows; other platforms skip that optional package.

The final `npm audit` reports **8 findings: 3 high, 5 low, 0 critical**. These are rooted
in `zod` and `deepmerge` through Expo CLI/config tooling and propagated to their parent
packages. Vitest was upgraded to remove the earlier critical test-runner findings.
The suggested Expo downgrade would leave the pinned SDK release line, so it was not
applied. Do not expose Metro or other development tooling to untrusted networks. Recheck
the SDK/tooling advisory status before a public deployment; this snapshot does not claim
a clean dependency audit. The application itself does not use Zod or deepmerge to parse
incident/QR payloads; it uses its own bounded relay validator and backend Pydantic models.
