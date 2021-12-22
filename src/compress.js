import * as sharp from 'sharp'
import * as redirect from './redirect.js'
import * as isAnimated from 'is-animated'
import * as execFile from 'child_process'
import * as gif2webp from 'gif2webp-bin';
import * as fs from 'fs'
import * as os from 'os'
import * as URL  from 'url'
import * as cacheMgr from 'cache-manager'
import * as cacheStore from 'cache-manager-fs-binary'
var cache = cacheMgr.caching({
    store: cacheStore,
    options: {
        ttl: 604800, //7d
        maxsize: 100000000, //1mb
        path: './cache',
        preventfill: true
    }
})

function compress(req, res, input) {
  const format = 'webp'
  const originType = req.params.originType
  const key = new URL(req.params.url) || ''
  
  if(originType.endsWith('gif') && isAnimated(input)){
    let {hostname, pathname} = new URL(req.params.url)
    
    let path = `${os.tmpdir()}/${hostname + encodeURIComponent(pathname)}`;
    fs.writeFile(path + '.gif', input, (err) => {
        console.error(err)
        if (err) return redirect(req, res)
        //defer to gif2webp *higher latency*
        execFile(gif2webp, ['-lossy','-mixed', '-m', 2, '-q', req.params.quality , '-mt', 
            `${path}.gif`,
            '-o', 
            `${path}.webp`] , (convErr) => {
                if(convErr) console.error(convErr)
                console.log('GIF Image converted!')
                fs.readFile(`${path}.webp`, (readErr, data) => {
                    console.error(readErr);
                    if (readErr ||  res.headersSent) return redirect(req, res)
                    setResponseHeaders(fs.statSync(`${path}.webp`), 'webp')
                    
                    //Write to stream
                    res.write(data)
                    
                    //initiate cleanup procedures
                    fs.unlink(`${path}.gif`, function(){})
                    fs.unlink(`${path}.webp`, function(){})
                    
                    res.end()
                })
        })

    })
    
  }else{

    const image = sharp(input);
 
    image
        .metadata(function(err, metadata){
            let pixelCount = metadata.width * metadata.height;
            var compressionQuality = req.params.quality;
            
            //3MP or 1.5MB
            if(pixelCount > 3000000 || metadata.size > 1536000){
                compressionQuality *= 0.1
            //2MP or 1MB
            }else if(pixelCount > 2000000 && metadata.size > 1024000){
                compressionQuality *= 0.25
            //1MP or 512KB
            }else if(pixelCount > 1000000 && metadata.size > 512000){
                compressionQuality *= 0.5
            //0.5MP or 256KB
            }else if(pixelCount > 500000 && metadata.size > 256000){
                compressionQuality *= 0.75
            }
            compressionQuality = Math.ceil(compressionQuality)
			
            cache.wrap(key, (callback) => {
            sharp(input)
            .grayscale(req.params.grayscale)
            .toFormat(format, {
                quality: compressionQuality,
                progressive: true,
                optimizeScans: true,
		reductionEffort: 6,
		smartSubsample: true
		    
		    
            })
            .toBuffer((err, output, info) => {
				callback(err, {binary: {output: output}, info: info})
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
    function setResponseHeaders (info, imgFormat){
        res.setHeader('content-type', `image/${imgFormat}`)
        res.setHeader('content-length', info.size)
        let filename = (new URL(req.params.url).pathname.split('/').pop() || "image") + '.' + format
        res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"' )
        res.setHeader('x-original-size', req.params.originSize)
        res.setHeader('x-bytes-saved', req.params.originSize - info.size)
        res.status(200)
    }
}

export default compress
