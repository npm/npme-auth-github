var Lab = require('lab'),
  nock = require('nock'),
  fs = require('fs'),
  SessionGithub = require('../session.js'),
  redis = require('redis'),
  config = require('@npm/enterprise-configurator').Config({
    githubHost: "https://api.github.com",
    verbose: true
  }),
  client = redis.createClient(),
  token = 'user-foobar';

Lab.experiment('get', function() {

  Lab.beforeEach(function(done) {
    client.del(token, function() {
      done();
    });
  });

  Lab.test('if user is not found in DB, user is looked up via GitHub API', function(done) {
    var session = new SessionGithub({
      githubHost: 'https://github.example.com'
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=foobar')
      .reply(200, fs.readFileSync('./test/fixtures/user-get.json'));

    session.get(token, function(err, data) {
      Lab.expect(data.name).to.eql('bcoe');
      Lab.expect(data.email).to.eql('ben@npmjs.com');
      githubApi.done();
      done();
    });
  });

  Lab.test('it creates session in Redis if user found in GitHub API', function(done) {
    var session = new SessionGithub({
      githubHost: 'https://github.example.com'
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=foobar')
      .reply(200, fs.readFileSync('./test/fixtures/user-get.json'));

    session.get(token, function(err, data) {
      githubApi.done();
      client.get(token, function(err, sessionJson) {
        var session = JSON.parse(sessionJson);
        Lab.expect(session.name).to.eql('bcoe');
        Lab.expect(session.email).to.eql('ben@npmjs.com');
        done();
      });
    });
  });

  Lab.test('it returns an error if GitHub API returns non 200', function(done) {
    var session = new SessionGithub({
      githubHost: 'https://github.example.com'
    });

    var githubApi = nock('https://github.example.com')
      .get('/api/v3/user?access_token=foobar')
      .reply(500);

    session.get(token, function(err, data) {
      githubApi.done();
      Lab.expect(err.code).to.eql(500);
      done();
    });
  });

});
