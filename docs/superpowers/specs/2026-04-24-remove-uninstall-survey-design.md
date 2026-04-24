# Remove Uninstall Survey Redirect Design

## Goal

When a user uninstalls the browser extension, the browser should not open any page.

Today the extension registers an uninstall survey URL through `browser.runtime.setUninstallURL()`. The URL points to Tally and is loaded from the `uninstallSurveyUrl` locale key. This behavior should be removed entirely.

## Scope

- Remove the background startup call that registers an uninstall URL.
- Remove the uninstall survey module because it will no longer have callers.
- Remove the unused `uninstallSurveyUrl` locale key from every extension locale file.
- Update local AGENTS documentation that describes the removed uninstall survey behavior.

The existing options-page "Survey" link is out of scope. It is a separate in-app product survey link and should remain unchanged.

## Approach

Use a deletion-first cleanup instead of setting the uninstall URL to an empty string. Avoiding the API call is simpler and avoids browser-specific validation behavior for empty uninstall URLs.

The background entrypoint will continue to initialize install/update handling, queues, context menus, TTS, PDF redirect, analytics, and other services. It will no longer import or call `setupUninstallSurvey()`.

## Testing

Validation should focus on absence of the removed behavior:

- Search for `setUninstallURL`, `setupUninstallSurvey`, and `uninstallSurveyUrl` and confirm no active code references remain.
- Search for the two Tally uninstall form IDs currently used by locales and confirm they are gone.
- Run a focused extension type check if practical.

No schema migration, runtime data migration, or UI snapshot changes are required.
