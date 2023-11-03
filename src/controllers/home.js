'use strict';

const url = require('url');

const plugins = require('../plugins');
const meta = require('../meta');
const user = require('../user');

function adminHomePageRoute() {
    return ((meta.config.homePageRoute === 'custom' ? meta.config.homePageCustom : meta.config.homePageRoute) || 'categories').replace(/^\//, '');
}

async function getUserHomeRoute(uid) {
    const settings = await user.getSettings(uid);
    let route = adminHomePageRoute();

    if (settings.homePageRoute !== 'undefined' && settings.homePageRoute !== 'none') {
        route = (settings.homePageRoute || route).replace(/^\/+/, '');
    }

    return route;
}

async function rewrite(req, res, next) {
    if (req.path !== '/' && req.path !== '/api/' && req.path !== '/api') {
        return next();
    }
    let route = adminHomePageRoute();
    if (meta.config.allowUserHomePage) {
        route = await getUserHomeRoute(req.uid, next);
    }

    let parsedUrl;
    let baseUrl = 'http://127.0.0.1:4567/';
    try {
        parsedUrl = new url.URL(route, baseUrl);
    } catch (err) {
        return next(err);
    }

    const { pathname } = parsedUrl;
    const hook = `action:homepage.get:${pathname}`;
    if (!plugins.hooks.hasListeners(hook)) {
        req.url = req.path + (!req.path.endsWith('/') ? '/' : '') + pathname;
    } else {
        res.locals.homePageRoute = pathname;
    }
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());

    next();
}

exports.rewrite = rewrite;

function pluginHook(req, res, next) {
    const hook = `action:homepage.get:${res.locals.homePageRoute}`;

    plugins.hooks.fire(hook, {
        req,
        res,
        next,
    });
}

exports.pluginHook = pluginHook;
