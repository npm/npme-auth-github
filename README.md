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

## Implementing your own authorization strategy

### npm Enterprise authorization flow

1. With each request npm CLI makes it sends a token previously received from the
frontdoor by the way of `npm login`.
2. Unless specified otherwise, frontdoor checks the authorization token on
every request by calling the authentication webservice.
3. Authentication webservice calls its configured authorization strategy, passing
the token to it and request context to it.
4. Authorization strategy either returns whether authorization was successful
or not.
5. If authorization succeeded, and session store has a session for this token,
frontdoor allows the request to go through.

### Authorization strategy API

Your module needs to export an `Authorizer` property. `Authorizer` is called
with an object containing options for the running npm Enterprise instance
and needs to return an object with an `authorize` function, for example:

```js
var Authorizer = exports.Authorizer = function(opts) {
};

Authorizer.prototype.authorize = function(credentials, cb) {
};
```

or

```js
exports.Authorizer = function (opts) {
  function authorize(credentials, cb) {
  }

  return {
    authorize: authorize
  };
};
```

The `authorize` function is called with an object that looks similar to this:

```js
{
  path: '/mymodule',
  method: 'PUT',
  headers: {
    // ...
    referer: 'npm publish',
    authorization: 'Bearer ...'
  },
  body: {
    // request body
  }
}
```

Basing on this, you should authorize the user.

If authorization succeeds, you should call the callback with no error and `true`.

```js
cb(null, true);
```

If authorization fails, you should call the callback with no error and `false`.

```js
cb(null, false);
```

If authorization errors out (for example, your internal authorization server
is down), you should call the callback with an error object:

```js
cb(new Error('Internal authorization server unreachable'));
```

So, here's an example of using an abstract HTTP authorization service:

```js
var request = require('request');

var Authorizer = exports.Authorizer = function(opts) {
  this.myAuthorizationHost = opts.myAuthorizationHost;
};

Authorizer.prototype.authorize = function(credentials, cb) {
  if (!credentials.headers.authorization ||
      !credentials.headers.authorization.match(/Bearer /)) {
    return cb(null, false);
  }

  request({
    url: this.myAuthorizationHost + '/authorize',
    method: 'POST',
    json: true,
    body: {
      token: credentials.headers.authorization.replace('Bearer ', '')
    }
  }, function (err, res, body) {
    if (err) {
      return cb(err);
    }

    if (res.statusCode !== 200) {
      return cb(null, false);
    }

    return cb(null, true);
  });
};
```

Since you have access to the `package.json`, if one is being sent by npm,
your authorization can involve various checks based on it. For example, GitHub
authorization plugin uses the `repository` field in connection with using GitHub
token as the authorization token to determine if user has write access to the
package they are trying to publish.

## Implementing your own session handler

Session handler is used by the authentication webservice to persist user's name
and email, keyed by the token created by the authentication strategy.

The point of creating custom session handlers is to provide strategy-specific
fallbacks for when user tries authorizing requests against an npm Enterprise
instance without the token present in the session store.  
For example, GitHub strategy provides a custom session store which first checks
Redis for the token, and if it's not present there, it attempts to authenticate
with GitHub with the same token. If GitHub authentication succeeds, user's
GitHub email and login are persisted back to Redis.

### npm Enterprise session flow

#### Authentication

See [npm Enterprise authentication flow](#npm-enterprise-authentication-flow)
for exact description of the authentication flow.

1. Frontdoor host calls the authentication webservice with a payload including
the credentials user input.
2. Authentication webservice calls its configured authentication strategy, passing
the payload received to it.
3. If authentication strategy succeeds, a token is returned.
4. Session handler is called with a key (in form of `"user-" + token`), and
session data to persist.

#### Authorization

See [npm Enterprise authorization flow](#npm-enterprise-authorization-flow)
for exact description of the authorization flow.

1. With each request npm CLI makes it sends a token previously received from the
frontdoor by the way of `npm login`.
2. Unless specified otherwise, frontdoor checks the authorization token on
every request by calling the authentication webservice.
3. Authentication webservice calls its configured authorization strategy, passing
the token and request context to it.
4. Authorization strategy returns whether authorization was successful or not.
5. If authorization succeeded, session store is called with a key (in form of
`"user-" + token`) to retrieve.

### Session handler API
Your module needs to export a `Session` property. `Session` is called with an
object containing options for the running npm Enterprise instance and needs to
return an object with `get` and `set` functions.

```js
var Session = exports.Session = function(opts) {
};

Session.prototype.get = function(key, cb) {
};

Session.prototype.set = function(key, session, cb) {
};
```

or

```js
exports.Session = function (opts) {
  function get(key, cb) {
  }

  function set(key, session, cb) {
  }

  return {
    get: get,
    set: set
  };
};
```

The `get` function is called with a key to retrieve from the session store.
If getting the key from session store succeeds, you should call the callback
with the session content.

```js
cb(null, {
  name: 'foobar',
  email: 'foobar@mycorp.com'
});
```

If getting the key fails, you should call the callback with an error.

```js
cb(new Error('No such key'));
```

The `set` function is called with a key and data to persist into the session
store. If storing the key succeeds, you should call the callback without an
error. If storing the key fails, you should call the callback with an error.

Here's an example of using a Redis-based session store, which fails over to
an abstract HTTP-based authorization service:

```js
var request = require('request');
var redis = require('redis');

var Session = exports.Session = function(opts) {
  this.myAuthorizationHost = opts.myAuthorizationHost;
  this.redis = redis.createClient();
};

Session.prototype._lookup = function(key, cb) {
  var self = this;

  request({
    url: this.myAuthenticationHost + '/authorize',
    method: 'POST',
    json: true,
    body: {
      token: key.split('-').splice(1).join('-')
    }
  }, function (err, res, body) {
    if (err) {
      return cb(err);
    }

    if (res.statusCode !== 200) {
      return cb(new Error('Authorization failed'));
    }

    var session = {
      name: body.username,
      email: body.email
    };

    self.set(key, session, function (err) {
      if (err) {
        return cb(err);
      }
      cb(null, session);
    });
  });
};

Session.prototype.get = function(key, cb) {
  var self = this;
  this.client.get(key, function(err, data) {
    if (err) return cb(err);
    if (data) return cb(null, JSON.parse(data));
    self._lookup(key, cb);
  });
};

Session.prototype.set = function(key, session, cb) {
  this.client.set(key, JSON.stringify(session), cb);
};
```
