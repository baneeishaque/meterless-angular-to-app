# Third-Party Notices

## Meterless engines

The engine ports under `src/app/engines/scout/`, `src/app/engines/hmem/`,
`src/app/engines/world-model/`, and `src/app/engines/markovian/` are derived
from the Meterless implementation specifications and reference implementations.

- Project: Meterless
- License: Apache License 2.0
- License text: [THIRD_PARTY_LICENSES/meterless-APACHE-2.0.txt](THIRD_PARTY_LICENSES/meterless-APACHE-2.0.txt)

The ports modify the reference code for browser execution: filesystem
dependencies are removed, persistence is injected, and Angular-facing
synchronous write seams are added.
