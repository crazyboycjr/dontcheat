'use strict';

const http = require('http');
const util = require('util');
const fs = require('fs');

const logfile = 'log.txt';
let log_writer = fs.createWriteStream(logfile, { flag: 'a' });

function LOG() {
	let args = Array.prototype.slice.call(arguments);
	let output = '[' + (new Date).toUTCString() + ']: '
		+ args.map(x => typeof x === 'string' ? x : util.inspect(x)).join(' ');
	console.log(output);
	log_writer.write(output + '\n');
}

function init_level(m) {
	let n, x, y, off, len;
	let level = {};
	for (let lv = 1; lv <= m; lv++) {
		n = lv + 1;
		x = Math.floor(Math.random() * n);
		y = Math.floor(Math.random() * n);
		len = 750 / n;
		off = (800 - len * n) / (n + 1);
		level[lv] = { pos: { ox: x, oy: y }, len: len };
		level[lv].tx = x * (len + off) + off;
		level[lv].ty = y * (len + off) + off;
	}
	return level;
}

let level = init_level(32);

function record(req, res) {
	LOG(req.socket.address(), req.url, req.method);
}

function Router() {
	this.routes = [];
}

Router.prototype.get = function(url, handler) {
	let path = url.split('/');
	path.shift();
	this.routes.push({ cond: path, method: 'GET', handler: handler });
}

Router.prototype.post = function(url, handler) {
	let path = url.split('/');
	path.shift();
	this.routes.push({ cond: path, method: 'POST', handler: handler });
}

function satisify(cond, m, url, m2) {
	let args = [];
	let flag = m === m2;
	let snpt = url.split('/');
	snpt.shift();
	for (let i in snpt) {
		if (i >= cond.length)
			flag = false;
		if (cond[i][0] !== ':' && cond[i] !== snpt[i])
			flag = false;
		if (cond[i][0] === ':')
			args.push(snpt[i]);
	}
	return { flag: flag, args: args };
}

Router.prototype.enter = async function(req, res) {
	for (let r of this.routes) {
		let ret = satisify(r.cond, r.method, req.url, req.method);
		if (ret.flag) {
			await r.handler.apply({ req: req, res: res }, ret.args);
			return;
		}
	}
	res.writeHead(404);
}

function allow_cors(req, res) {
	//res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8000');
	res.setHeader('Access-Control-Allow-Origin', 'http://10.222.198.96:8000');
}

async function target(lv) {
	let ctx = this;
	let pos = level[lv].pos;
	ctx.res.write(JSON.stringify({ x: pos.ox, y: pos.oy }));
}

function parse(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', chunk => data += chunk);
		req.on('end', () => resolve(data));
		req.on('error', err => reject(err));
	});
}

async function judge() {
	let ctx = this;
	let ret, pos, tx, ty, len, lv;
	let post = await parse(ctx.req);
	post = JSON.parse(post);
	lv = level[post.lv]
	pos = lv.pos;
	len = lv.len;
	tx = lv.tx;
	ty = lv.ty;
	ret = tx <= post.x && ty <= post.y &&
		post.x <= tx + post.len && post.y <= ty + post.len;
	ctx.res.write(JSON.stringify(ret ? "success" : "failure"));
}

function square_err(arr) {
	let n = arr.length;
	let avg = 0, s = 0;
	for (let i = 0; i < n; i++)
		avg += arr[i];
	avg /= n;
	for (let i = 0; i < n; i++)
		s += (avg - arr[i]) * (avg - arr[i]);
	return s / n;
}

function dist(x1, y1, x2, y2) {
	return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}

function is_person(game_log) {
	let time = [], time_se, min_interval, total_time;
	total_time = (game_log[game_log.length - 1].ts - game_log[0].ts) / 1000;
	LOG('total time = ', total_time);
	for (let i = 1; i < game_log.length; i++) {
		time.push((game_log[i].ts - game_log[i - 1].ts) / 1000);
	}
	time_se = square_err(time);
	LOG('time square error = ', time_se);
	min_interval = Math.min.apply(null, time);
	LOG('minimum time interval = ', min_interval);

	let r = [], r_se;
	let theta = [], theta_se;
	for (let log of game_log) {
		theta.push(Math.atan2(log.y - level[log.lv].ty, log.x - level[log.lv].tx));
		r.push(dist(log.x, log.y, level[log.lv].tx, level[log.lv].ty));
	}
	theta_se = square_err(theta);
	LOG('theta square error = ', theta_se);
	r_se = square_err(r);
	LOG('r square error = ', r_se);

	return total_time >= 20 && min_interval >= 0.25 && time_se > 0.02 && theta_se > 0.001 && r_se > 50;
}

async function return_flag() {
	let ctx = this;
	let post = await parse(ctx.req);
	post = JSON.parse(post);
	LOG(post);
	if (is_person(post)) {
		ctx.res.write(JSON.stringify({ cheat: false, flag: 'Can_Y0u_5ee_m2' }));
	} else {
		ctx.res.write(JSON.stringify({ cheat: true, flag: '' }));
	}
}

let router = new Router();
router.get('/target/:lv', target);
router.post('/judge', judge);
router.post('/flag', return_flag);

let app = {};
app.middleware = [];
app.middleware.push([null, record]);
app.middleware.push([null, allow_cors]);
app.middleware.push([router, router.enter]);

let server = http.createServer(async (req, res) => {
	for (let [thisArg, mw] of app.middleware) {
		await mw.call(thisArg, req, res);
	}
	res.end();
});

server.listen(47628);

process.on('unhandledRejection', (e) => { LOG(e); });
