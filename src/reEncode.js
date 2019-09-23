const redirect = require('./redirect')
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require("fluent-ffmpeg")
const fs = require('fs')
const os = require('os')
const {URL} = require('url')

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function reEncode(req, res, input) {
    var quality = req.params.quality;
    var vBitrateTarget = quality * 10; //200 - 800
    var aBitrateTarget = quality * 2;
    
    ffmpeg.ffprobe(req.params.url, function(err, metadata) {
        let audioStreamInfo, videoStreamInfo, audioOnly
        //format = metadata.format
        if(err || !metadata){
            return redirect(req, res)
        }
        if(metadata){
            for (let stream in metadata.streams){
                stream = metadata.streams[stream]
                if (videoStreamInfo && audioStreamInfo){
                    console.log("multiple audio or video streams detected")
                }
                //console.log(stream)
                switch(stream.codec_type){
                    case("video"):
                        videoStreamInfo = stream
                        break
                    case("audio"):
                        audioStreamInfo = stream
                        break
                }
            }
            audioOnly = !videoStreamInfo;
            
            if((!audioStreamInfo && !videoStreamInfo) || (audioStreamInfo && audioStreamInfo.bit_rate <= aBitrateTarget * 800 && audioOnly) || videoStreamInfo && (
                videoStreamInfo.bit_rate <= vBitrateTarget * 800 || videoStreamInfo.duration > 90)){
                return redirect(req, res)
            }
        }
        res.setHeader('content-type', `${audioOnly ? "audio":"video"}/webm`)
        
        //let {hostname, pathname} = new URL(req.params.url)
        //let path = `${os.tmpdir()}/${hostname + encodeURIComponent(pathname)}.webm`;
        
        if(audioOnly){
            ffmpeg(req.params.url)
                .audioCodec("opus")
                .format("webm")
                .audioBitrate(quality * 2)
                .pipe(res, { end: true })
        }else{
            ffmpeg(req.params.url)
                .videoCodec("libvpx-vp9")//videoStreamInfo.codec_name)
                .videoBitrate(vBitrateTarget)
                .audioCodec("opus")//audioStreamInfo.codec_name)
                //.audioQuality(Math.ceil(quality / 20)) //1-4
                .audioBitrate(aBitrateTarget)
                .size(
                    //480p cap
                    '?x' + Math.min(360, videoStreamInfo ? videoStreamInfo.height : 0)
                )
                //.format(format.format_name.split(',')[0])
                .format('webm')
                .outputOptions(["-deadline realtime","-cpu-used 8"])
                //.outputOptions("-movflags +frag_keyframe")
                .on('error', function(err) {
                    console.log('An error occurred: ' + err.message)
                    console.error(err);
                    return redirect(req, res)
                })
                .on('stderr', function(stderrLine) {
                    console.log('Stderr output: ' + stderrLine);
                })
                .on('end', function() {
                console.log('Processing finished !')
                
                //res.end();
                // var readStream = fs.createReadStream(path)
                //   // This will wait until we know the readable stream is actually valid before piping
                //     readStream.on('open', function () {
                //       // This just pipes the read stream to the response object (which goes to the client)
                //       readStream.pipe(res);
                //     });
                    
                //     // This catches any errors that happen while creating the readable stream (usually invalid names)
                //     readStream.on('error', function(err) {
                //       res.end(err);
                //     });
                    
                //     readStream.on('end', function(err) {
                //       fs.unlink(path, function(){})
                //       res.end();
                //     });
                })
                .pipe(res, { end: true })
                //.save(path)
        }
        
    })
}

module.exports = reEncode
