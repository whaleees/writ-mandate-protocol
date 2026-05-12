pub mod create_mandate;
pub mod submit_request;

// Glob re-exports propagate the auto-generated __client_accounts_* modules
// (produced by #[derive(Accounts)]) all the way to the crate root, which is
// required by the #[program] macro. `handler` functions are pub(crate) so
// they don't surface here and cause naming conflicts.
pub use create_mandate::*;
pub use submit_request::*;
