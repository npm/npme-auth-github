# npme-auth-github
GitHub authentication and authorization strategy for npm Enterprise.

## Implementing your own authentication strategy

### npm Enterprise authentication flow

1. npm CLI calls the frontdoor host with a request to authenticate when `npm login`
is invoked.
2. Frontdoor host calls the authentication webservice with a payload including
the credentials user input.
3. Authentication webservice calls its configured authentication strategy, passing
the payload received to it.
4. Authentication strategy either returns an object with a token and an user
object to persist into the session store if authentication succeeded or no
token and an optional message if authentication failed (see below for the
exact API).
5. If authentication succeeded, frontdoor passes the token back to npm CLI.
npm CLI will further use the token to authorize its request.

### Authentication strategy API

Your module needs to export an `Authenticator` property.  `Authenticator` is
called with an object containing options for the running npm Enterprise instance
and needs to return an object with an `authenticate` function, for example:

```js
var Authenticator = exports.Authenticator = function(opts) {
};

Authenticator.prototype.authenticate = function(credentials, cb) {
};
```

or

```js
exports.Authenticator = function (opts) {
  function authenticate(credentials, cb) {
  }

  return {
    authenticate: authenticate
  };
};
```

The `authenticate` function is called with an object containing a `body` property,
which is what the npm CLI called the frontdoor host with:

```js
{
  body: {
    name: 'foobar',
    email: 'foobar@mycorp.com',
    password: 'iloveicecream'
  }
}
```

Basing on this, you should authenticate the user.

If authentication succeeds, you should call the callback with no error and an
object with `token` and `user` properties. `token` will be passed back to npm
CLI in order to authorize further requests, and `user` will be persisted into
the session store.

```js
cb(null, {
  token: "username-authtoken",
  user: {
    name: 'foobar',
    email: 'foobar@mycorp.com'
  }
});
```

If authentication isn't correct, you should call the callback with no error
and an object with optional `message` property which will be displayed to the
user:

```js
cb(null, {
  message: "You don't work here anymore"
});
```

If authentication errors out (for example, your internal authentication server
is down, you should call the callback with an error object:

```js
cb(new Error('Internal authentication server unreachable'));
```

So, a basic implementation of an authentication strategy based on an abstract
HTTP authentication service could look something like that:

```js
var request = require('request');

var Authenticator = exports.Authenticator = function(opts) {
  this.myAuthenticationHost = opts.myAuthenticationHost;
};

Authenticator.prototype.authenticate = function(credentials, cb) {
  request({
    url: this.myAuthenticationHost + '/auth',
    method: 'POST',
    json: true,
    body: {
      username: credentials.body.username,
      password: credentials.body.password
    }
  }, function (err, res, body) {
    if (err) {
      return cb(err);
    }

    if (res.statusCode !== 200) {
      return cb(null, {
        message: 'Authentication failed'
      });
    }

    return cb(null, {
      token: body.token,
      user: body.user
    });
  });
};
```
