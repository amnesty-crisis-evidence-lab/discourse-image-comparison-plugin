import { withPluginApi } from 'discourse/lib/plugin-api';

function initializePlugin(api) {
    api.decorateCooked($elem => {
        //as discourse trim class name during adding content through REST API so we readd it here
        var beforeImageContainer = $elem.find('.x1y1.img-before').parent();
        $(beforeImageContainer).addClass('img-before-div');
        var afterImageContainer = $elem.find('.x1y1.img-after').parent();
        $(afterImageContainer).addClass('img-after-div');
        $(afterImageContainer).parent().addClass('image-comparison v1');

        zoomBeforeAfter({
            beforeImageContainer: beforeImageContainer,
            afterImageContainer: afterImageContainer,
            zoomWidth: 200
        });

        function zoomBeforeAfter(settings) {
            var beforeImageContainer = settings.beforeImageContainer;
            var afterImageContainer = settings.afterImageContainer;
            var zoomWidth = (settings.zoomWidth) ? settings.zoomWidth : 120;

            var beforeImageSources = [], afterImageSources = [];

            //get images source THEN hide them
            extractImageSource(beforeImageSources, beforeImageContainer);
            extractImageSource(afterImageSources, afterImageContainer);

            $(beforeImageContainer).find('img').hide();
            $(afterImageContainer).find('img').hide();

            //init canvas to render images
            var html = "<div class='square-container'>" + 
                    '<canvas id="smallBeforeCanvas">Your browser does not support the HTML5 canvas tag.</canvas>' +
                    '<canvas id="bigBeforeCanvas" style="display:none">Your browser does not support the HTML5 canvas tag.</canvas>' +
                "</div>";
            $(beforeImageContainer).append(html);

                //squarec-container help to keep canvas in square shape during resize
            html = "<div class='square-container'>" + 
                    '<canvas id="smallAfterCanvas">Your browser does not support the HTML5 canvas tag.</canvas>' +
                    '<canvas id="bigAfterCanvas" style="display:none">Your browser does not support the HTML5 canvas tag.</canvas>' +
                "</div>";
            $(afterImageContainer).append(html);

            var beforeImages = [];
            var bigBeforeCanvas = $(beforeImageContainer).find("#bigBeforeCanvas")[0];
            var bigBeforeCanvasContext = bigBeforeCanvas.getContext('2d');
            var smallBeforeCanvas = $(beforeImageContainer).find("#smallBeforeCanvas")[0];
            var smallBeforeCanvasContext = smallBeforeCanvas.getContext('2d');

            var afterImages = [];
            var bigAfterCanvas = $(afterImageContainer).find("#bigAfterCanvas")[0];
            var bigAfterCanvasContext = bigAfterCanvas.getContext('2d');
            var smallAfterCanvas = $(afterImageContainer).find("#smallAfterCanvas")[0];
            var smallAfterCanvasContext = smallAfterCanvas.getContext('2d');

            //looks like node has attach to dom yet so we don't have dimension now
            //then use predefine one
            var size = $elem.find('.square-container').first().width();
            if (!(size > 0)) {
                size = 380;
            }
            $(smallBeforeCanvas).attr('width', size).attr('height', size);
            $(bigBeforeCanvas).attr('width', size * 2).attr('height', size * 2);
            $(smallAfterCanvas).attr('width', size).attr('height', size);
            $(bigAfterCanvas).attr('width', size * 2).attr('height', size * 2);

            var tileRealSize = 256;//square of 256 x 256
            var tileViewSize = size/2;
            var zoomLevel = tileRealSize/tileViewSize;
            
            // return;
            init(beforeImageSources, beforeImages, smallBeforeCanvasContext, bigBeforeCanvasContext);
            init(afterImageSources, afterImages, smallAfterCanvasContext, bigAfterCanvasContext);

            var mouseOutBefore = true, mouseOutAfter = true;
            $elem.find('#smallBeforeCanvas').mouseout(function(){
                mouseOutBefore = true;
                if (mouseOutAfter) {
                    drawSmallImages(smallBeforeCanvasContext, beforeImages);
                    drawSmallImages(smallAfterCanvasContext, afterImages);
                }
            });
            $elem.find('#smallAfterCanvas').mouseout(function(){
                mouseOutAfter = true;
                if (mouseOutBefore) {
                    drawSmallImages(smallBeforeCanvasContext, beforeImages);
                    drawSmallImages(smallAfterCanvasContext, afterImages);
                }
            });

            $elem.find('#smallBeforeCanvas').mousemove(function(evt){
                mouseOutBefore = false;

                var rect = smallBeforeCanvas.getBoundingClientRect();
                var x = evt.clientX - rect.left;
                var y = evt.clientY - rect.top;

                zoom(smallBeforeCanvas, bigBeforeCanvas, beforeImages, x, y);
                zoom(smallAfterCanvas, bigAfterCanvas, afterImages, x, y);
            });

            $elem.find('#smallAfterCanvas').mousemove(function(evt){
                mouseOutAfter = false;

                var rect = smallAfterCanvas.getBoundingClientRect();
                var x = evt.clientX - rect.left;
                var y = evt.clientY - rect.top;

                zoom(smallBeforeCanvas, bigBeforeCanvas, beforeImages, x, y);
                zoom(smallAfterCanvas, bigAfterCanvas, afterImages, x, y);
            });

            //find <img> in imageContainer, extract <img>'s source to imageSources
            function extractImageSource(imageSources, imageContainer) {
                if ($(imageContainer).find('img').length == 0) {
                    console.error('There is no before images');
                }
                $.each($(imageContainer).find('img'), function(index, value){
                    imageSources.push($(value).attr('src'));
                });

            }

            function zoom(smallCanvas, bigCanvas, images, x, y) {
                var smallCanvasContext = smallCanvas.getContext('2d');
                var bigCanvasContext = bigCanvas.getContext('2d');

                var viewPort = zoomWidth;
                // var zoomLevel = 2;
                drawSmallImages(smallCanvasContext, images);

                var largeX1,largeY1;
                largeX1 = x * zoomLevel - viewPort/2;
                largeY1 = y * zoomLevel - viewPort/2;

                var bigImageCut = bigCanvasContext.getImageData(largeX1 , largeY1, viewPort, viewPort);
                
                var x1, y1;
                x1 = x - viewPort/2;
                y1 = y - viewPort/2;
                smallCanvasContext.putImageData(
                    bigImageCut, 
                    x1, y1
                );

                smallCanvasContext.strokeStyle = '#ff0';  // some color/style
                smallCanvasContext.lineWidth = 1;
                smallCanvasContext.strokeRect(x1, y1, viewPort, viewPort);      
            }

            function init(imageSources, images, smallContext, bigContext) {
                //create scope for promise
                function imageOnload(image) {
                    var deferred = Q.defer();
                    image.onload = function() {
                        deferred.resolve('a');
                    };
                    return deferred.promise;
                }

                var promises = [];
                for ( var i = 0; i < imageSources.length; i++ ) {
                    var image = new Image();
                    image.crossOrigin = 'Anonymous';
                    promises.push(imageOnload(image));
                    image.src = imageSources[i];
                    images.push(image);
                } 

                Q.all(promises)
                .then(function(){
                    drawSmallImages(smallContext, images);
                    drawBigImages(bigContext, images);
                },function(){
                    console.error("Error in loading images");
                });
            }

            function drawSmallImages(context, images) {
                context.drawImage(images[0], 0, 0, tileRealSize, tileRealSize, 0, 0, tileViewSize, tileViewSize);
                context.drawImage(images[1], 0, 0, tileRealSize, tileRealSize, tileViewSize, 0, tileViewSize, tileViewSize);
                context.drawImage(images[2], 0, 0, tileRealSize, tileRealSize, 0, tileViewSize, tileViewSize, tileViewSize);
                context.drawImage(images[3], 0, 0, tileRealSize, tileRealSize, tileViewSize, tileViewSize, tileViewSize, tileViewSize);         
            }

            function drawBigImages(context, images) {
                context.drawImage(images[0], 0, 0, tileRealSize, tileRealSize, 0, 0, tileRealSize, tileRealSize);
                context.drawImage(images[1], 0, 0, tileRealSize, tileRealSize, tileRealSize, 0, tileRealSize, tileRealSize);
                context.drawImage(images[2], 0, 0, tileRealSize, tileRealSize, 0, tileRealSize, tileRealSize, tileRealSize);
                context.drawImage(images[3], 0, 0, tileRealSize, tileRealSize, tileRealSize, tileRealSize, tileRealSize, tileRealSize);
            }
        }        

    });
}

export default {
  name: 'image-comparison',
  initialize() {
    withPluginApi('0.5', initializePlugin);
  }
};