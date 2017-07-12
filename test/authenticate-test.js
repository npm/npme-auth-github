
var config = require('@npm/enterprise-configurator').Config({
    headless: true
  }),
  lab = require('lab'),
  Lab = exports.lab = lab.script(),
  Code = require('code'),
  AuthenticateGithub = require('../authenticator.js'),
  nock = require('nock'),
  fs = require('fs');

Lab.experiment('getAuthorizationToken', function() {
  Lab.it("returns authorization token if username and password are valid", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com', {
        // we should populate the auth headers with appropriate
        // username and password.
        reqheaders: {
          'authorization': 'Basic YmNvZS10ZXN0OmZvb2Jhcg=='
        }
      })
      .post('/api/v3/authorizations', {
        scopes: ["user","public_repo","repo","repo:status","gist"],
        note: 'npm Enterprise login (0)',
        note_url: 'https://www.npmjs.org'
      })
      .reply(200, fs.readFileSync('./test/fixtures/authenticate-success.json'), {
        'content-type': 'application/json; charset=utf-8'
      });

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').done(function(token) {
      Code.expect(token).to.deep.equal('cc84252fd8061b232beb5e345f33b13d120c236c');
      packageApi.done();
      done();
    });
  });

  Lab.it("uses port parsed from githubHost", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com:4444',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com:4444', {
        // we should populate the auth headers with appropriate
        // username and password.
        reqheaders: {
          'authorization': 'Basic YmNvZS10ZXN0OmZvb2Jhcg=='
        }
      })
      .post('/api/v3/authorizations', {
        scopes: ["user","public_repo","repo","repo:status","gist"],
        note: 'npm Enterprise login (0)',
        note_url: 'https://www.npmjs.org'
      })
      .reply(200, fs.readFileSync('./test/fixtures/authenticate-success.json'), {
        'content-type': 'application/json; charset=utf-8'
      });

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').done(function(token) {
      Code.expect(token).to.deep.equal('cc84252fd8061b232beb5e345f33b13d120c236c');
      packageApi.done();
      done();
    });
  });

  Lab.it("raises an exception if 401 is returned", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com')
      .post('/api/v3/authorizations')
      .reply(401);

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').catch(function(err) {
      Code.expect(err.code).to.deep.equal(401);
      packageApi.done();
      done();
    }).done();
  });

  Lab.it("raises an exception if 500 is returned", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com')
      .post('/api/v3/authorizations')
      .reply(500);

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').catch(function(err) {
      Code.expect(err.code).to.deep.equal(500);
      packageApi.done();
      done();
    }).done();
  });

  Lab.it("returns authorization token if username and password are valid, and user is a member of the org", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      githubOrg: 'acme',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com', {
        // we should populate the auth headers with appropriate
        // username and password.
        reqheaders: {
          'authorization': 'Basic YmNvZS10ZXN0OmZvb2Jhcg=='
        }
      })
      .post('/api/v3/authorizations', {
        scopes: ["user","public_repo","repo","repo:status","gist"],
        note: 'npm Enterprise login (0)',
        note_url: 'https://www.npmjs.org'
      })
      .reply(200, fs.readFileSync('./test/fixtures/authenticate-success.json'), {
        'content-type': 'application/json; charset=utf-8'
      })
      .get('/api/v3/orgs/acme/members/bcoe-test')
      .reply(204);

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').nodeify(function(err, token) {
      Code.expect(!!err).to.equal(false);
      Code.expect(token).to.deep.equal('cc84252fd8061b232beb5e345f33b13d120c236c');
      packageApi.done();
      done();
    });
  });

  Lab.it("returns authorization token if username and password are valid, and user is a member of at least one org", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      githubOrg: 'org1, acme, org3',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com', {
        // we should populate the auth headers with appropriate
        // username and password.
        reqheaders: {
          'authorization': 'Basic YmNvZS10ZXN0OmZvb2Jhcg=='
        }
      })
      .post('/api/v3/authorizations', {
        scopes: ["user","public_repo","repo","repo:status","gist"],
        note: 'npm Enterprise login (0)',
        note_url: 'https://www.npmjs.org'
      })
      .reply(200, fs.readFileSync('./test/fixtures/authenticate-success.json'), {
        'content-type': 'application/json; charset=utf-8'
      })
      .get('/api/v3/orgs/acme/members/bcoe-test')
      .reply(204);

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').nodeify(function(err, token) {
      Code.expect(!!err).to.equal(false);
      Code.expect(token).to.deep.equal('cc84252fd8061b232beb5e345f33b13d120c236c');
      packageApi.done();
      done();
    });
  });

  Lab.it("executes callback with an error if user is not a member of the org", function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      githubOrg: 'acme',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com', {
        // we should populate the auth headers with appropriate
        // username and password.
        reqheaders: {
          'authorization': 'Basic YmNvZS10ZXN0OmZvb2Jhcg=='
        }
      })
      .post('/api/v3/authorizations', {
        scopes: ["user","public_repo","repo","repo:status","gist"],
        note: 'npm Enterprise login (0)',
        note_url: 'https://www.npmjs.org'
      })
      .reply(200, fs.readFileSync('./test/fixtures/authenticate-success.json'))
      .get('/api/v3/orgs/acme/members/bcoe-test')
      .reply(404);

    authenticateGithub.getAuthorizationToken('bcoe-test', 'foobar').nodeify(function(err, token) {
      Code.expect(err.code).to.equal(401);
      Code.expect(!!token).to.equal(false);
      packageApi.done();
      done();
    });
  });
});

Lab.experiment('authenticate', function() {
  Lab.it('executes callback with token, if successful', function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com', {
        // we should populate the auth headers with appropriate
        // username and password.
        reqheaders: {
          'authorization': 'Basic YmNvZS10ZXN0OmZvb2Jhcg=='
        }
      })
      .post('/api/v3/authorizations', {
        scopes: ["user","public_repo","repo","repo:status","gist"],
        note: 'npm Enterprise login (0)',
        note_url: 'https://www.npmjs.org'
      })
      .reply(200, fs.readFileSync('./test/fixtures/authenticate-success.json'), {
        'content-type': 'application/json; charset=utf-8'
      });

    authenticateGithub.authenticate({
      body: {
        name: 'bcoe-test',
        password: 'foobar'
      }
    }, function(err, res) {
      Code.expect(res.token).to.deep.equal('cc84252fd8061b232beb5e345f33b13d120c236c');
      Code.expect(res.user.name).to.deep.equal('bcoe-test');
      // email should have a sane default, if we fail to look it up.
      Code.expect(res.user.email).to.deep.equal('npme@example.com');
      done();
    });
  });

  Lab.it('executes callback with error if GHE API fails to generate token', function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com')
      .post('/api/v3/authorizations')
      .reply(401);

    authenticateGithub.authenticate({
      body: {
        name: 'bcoe-test',
        password: 'foobar'
      }
    }, function(err, resp) {
      Code.expect(resp.message).to.deep.equal('unauthorized');
      packageApi.done();
      done();
    });
  });

  Lab.it('executes callback with error if password is missing', function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    authenticateGithub.authenticate({
      body: {
        name: 'bcoe-test',
      }
    }, function(err) {
      Code.expect(err.message).to.deep.equal('invalid credentials format');
      done();
    });
  });

  Lab.it('executes callback with error credentials are missing', function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    authenticateGithub.authenticate(null, function(err) {
      Code.expect(err.message).to.deep.equal('invalid credentials format');
      done();
    });
  });

  Lab.it('executes callback with error if GHE API fails with unexpected status code', function(done) {
    var authenticateGithub = new AuthenticateGithub({
      githubHost: 'https://github.example.com',
      timestamp: function() {
        return 0;
      },
      debug: false
    });

    var packageApi = nock('https://github.example.com')
      .post('/api/v3/authorizations')
      .reply(432);

    authenticateGithub.authenticate({
      body: {
        name: 'bcoe-test',
        password: 'foobar'
      }
    }, function(err, resp) {
      Code.expect(err.code).to.deep.equal(432);
      packageApi.done();
      done();
    });
  });
});
