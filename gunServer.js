var express = require('express');
var Gun     = require('gun');
require('gun/axe');

var app = express();
app.use(Gun.serve);
app.use('/', express.static('./index.html'));

var ssl = true;
var fs = require('fs');
var https = require('https');

var sslServer = null;
var privateKey = null;
var certificate = null;
if (ssl) {
	privateKey = fs.readFileSync('crt/privateKey.key', 'utf8');
	certificate = fs.readFileSync('crt/certificate.crt', 'utf8');
	sslServer = https.createServer({ key: privateKey, cert: certificate }, app);

	sslServer.listen(443, function (err) {
		if (err) {
			return;
		}
		
		var gun = Gun({ web: sslServer });
		
		global.Gun = Gun; /// make global to `node --inspect` - debug only
		global.gun = gun; /// make global to `node --inspect` - debug only

		console.log('ssl server running');
	}); 
}
