# @substrate/connect-extension-interface

This is a module consisting only of types.  These types are the interface
exposed through `window` by the `@substrate/extension`. So, that libraries
can have access to the basic functionalities of `@substrate/smoldot-light`
when the `@substrate/extension` is installed without having the create a new
instance of the webkworker and the WASM module of the substrate light-client.
