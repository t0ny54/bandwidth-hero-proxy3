const sharp = require('sharp')
const redirect = require('./redirect')
const isAnimated = require('is-animated')
const { execFile } = require('child_process')
const gif2webp = require('gif2webp-bin')
const fs = require('fs')
const os = require('os')
const { URL } = require('url')
const cacheMgr = require('cache-manager')
const cacheStore = require('cache-manager-fs-binary')
const cache = cacheMgr.caching({
    store: cacheStore,
    options: {
        ttl: 604800, //7d
        maxsize: 1073741824, //1GB
        path: './cache',
        preventfill: true
    }
})
//import { execFile } from 'node:child_process';
//import gif2webp from 'gif2webp-bin';
//import sharp  from 'sharp';
//import edirectfrom './redirect';
//import isAnimated from 'is-animated';
//import fs from  'fs';
//import os from 'os';
//import { URL } from 'url';
//import cacheMgr from 'cache-manager';
//import cacheStore from'cache-manager-fs-binary';
//import cache from cacheMgr.caching({
//    store: cacheStore,
//    options: {
//        ttl: 604800, //7d
//        maxsize: 1073741824, //1GB
//        path: './cache',
//        preventfill: true
//    }
//})

function compress(req, res, input) {
    const format = 'webp'
    const originType = req.params.originType
    const key = new URL(req.params.url) || ''
    const stats = sharp.cache();
    sharp.cache( { memory: 200 } );

    if (originType.endsWith('gif') && isAnimated(input)) {
        let { hostname, pathname } = new URL(req.params.url)

        let path = `${os.tmpdir()}/${hostname + encodeURIComponent(pathname)}`;
        fs.writeFile(path + '.gif', input, (err) => {
            console.error(err)
            if (err) return redirect(req, res)
            //defer to gif2webp *higher latency*
            execFile(gif2webp, ['-mixed', '-m', 6, '-q', 100, '-mt', '-v',
                `${path}.gif`,
                '-o',
                `${path}.webp`], (convErr) => {
                    if (convErr) console.error(convErr)
                    console.log('GIF Image converted!')
                    fs.readFile(`${path}.webp`, (readErr, data) => {
                        console.error(readErr);
                        if (readErr || res.headersSent) return redirect(req, res)
                        setResponseHeaders(fs.statSync(`${path}.webp`), 'webp')

                        //Write to stream
                        res.write(data)

                        //initiate cleanup procedures
                        fs.unlink(`${path}.gif`, function () { })
                        fs.unlink(`${path}.webp`, function () { })

                        res.end()
                    })
                })

        })

    }else if (!originType.endsWith('webp')) {

        const image = sharp(input);

        image
            .metadata(function (err, metadata) {
                let pixelCount = metadata.width * metadata.height;
                var compressionQuality = req.params.quality;

                //3MP or 1.5MB
                if (pixelCount > 3000000 || metadata.size > 1536000) {
                    compressionQuality *= 0.1
                    //2MP or 1MB
                } else if (pixelCount > 2000000 && metadata.size > 1024000) {
                    compressionQuality *= 0.25
                    //1MP or 512KB
                } else if (pixelCount > 1000000 && metadata.size > 512000) {
                    compressionQuality *= 0.5
                    //0.5MP or 256KB
                } else if (pixelCount > 500000 && metadata.size > 256000) {
                    compressionQuality *= 0.75
                }
                compressionQuality = Math.ceil(compressionQuality)

                cache.wrap(key, (callback) => {
                    sharp(input)
                        .grayscale(req.params.grayscale)
                        .toFormat(format, {
                            quality: compressionQuality,
                            progressive: false,
                            optimizeScans: false,
                            effort: 1,
                            smartSubsample: true,
                            lossless: false

                        })
                        .toBuffer((err, output, info) => {
                            callback(err, { binary: { output: output }, info: info })
                        })
                        
                }, (err, obj) => {
                    if (err || !obj || !obj.info || res.headersSent) return redirect(req, res)
                 setResponseHeaders(obj.info, format)
                            res.status(200)
                            res.write(obj.binary.output)
                            res.end()


                    
                })
            })
    }
    function setResponseHeaders(info, imgFormat) {
        res.setHeader('content-type', `image/${imgFormat}`)
        res.setHeader('content-length', info.size)
        let filename = (new URL(req.params.url).pathname.split('/').pop() || "image") + '.' + format
        res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"')
        res.setHeader('x-original-size', req.params.originSize)
        res.setHeader('x-bytes-saved', req.params.originSize - info.size)
    }

}

module.exports = compress
