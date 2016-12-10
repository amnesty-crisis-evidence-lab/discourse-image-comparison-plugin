import { withPluginApi } from 'discourse/lib/plugin-api';
import showModal from 'discourse/lib/show-modal';

function initializePlugin(api) {
    api.decorateCooked($elem => {
        //as discourse trim class name during adding content through REST API so we readd it here

            //detect if we are in a post which include image comparison
        if ( $elem.find('.img-before').length == 0 ) {
            return;
        }

            //dom and js var map : 
            //<div class="cooked">//$elem
            //    <div>
            //       <div>image content</div>//beforeImageContainer
            //       <div>image content</div>//afterImageContainer
            //    </div>

        var beforeImageContainer = $elem.children().first().children().first();
        var afterImageContainer = $elem.children().first().children().last();

        $(beforeImageContainer).addClass('img-before-div');
        $(afterImageContainer).addClass('img-after-div');
        $(afterImageContainer).parent().addClass('image-comparison v1');

        var html = '<nav class="mobile-tab">' +
                '<div class="before-label-mobile nav-item" data-target="img-before-div"> Before </div>' +
                '<div class="after-label-mobile nav-item active" data-target="img-after-div"> After </div>' +
            '</nav>' +
            '<nav class="desktop-tab">' +
                '<div class="before-label"> Before </div>' +
                '<div class="after-label"> After </div>' +     
            '</nav>';
        $(afterImageContainer).parent().prepend(html);

        zoomBeforeAfter({
            beforeImageContainer: beforeImageContainer,
            afterImageContainer: afterImageContainer
        });

        function zoomBeforeAfter(settings) {
            var beforeImageContainer = settings.beforeImageContainer;
            var afterImageContainer = settings.afterImageContainer;            

            var beforeImageSources = [], afterImageSources = [];

            //get images source THEN hide them
            extractImageSource(beforeImageSources, beforeImageContainer);
            extractImageSource(afterImageSources, afterImageContainer);

            //clean before discourse's content
            $(beforeImageContainer).empty();
            $(afterImageContainer).empty();

            //init canvas to render images
            var html = '<!-- to enable zoom, images has been replaced with canvas -->' +
                    '<canvas id="smallBeforeCanvas">Your browser does not support the HTML5 canvas tag.</canvas>' +
                    '<canvas id="bigBeforeCanvas" style="display:none">Your browser does not support the HTML5 canvas tag.</canvas>';
            $(beforeImageContainer).append(html);

            html = '<!-- to enable zoom, images has been replaced with canvas -->' +
                    '<canvas id="smallAfterCanvas">Your browser does not support the HTML5 canvas tag.</canvas>' +
                    '<canvas id="bigAfterCanvas" style="display:none">Your browser does not support the HTML5 canvas tag.</canvas>';
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

            //the width of the whole before/after image
            var size;
            
            var tileRealSize = 256;//square of 256 x 256
            var tileViewSize;//tile resized version
            var zoomLevel;
            //dimension for zoom square window
            var zoomWidth;

            //establish first time setting for dimension
            resize();

            $(bigBeforeCanvas).attr('width', size * 2).attr('height', size * 2);            
            $(bigAfterCanvas).attr('width', size * 2).attr('height', size * 2);

            $(window).on('resize', function() {
                resize();
                drawSmallImages(smallBeforeCanvasContext, beforeImages);
                drawSmallImages(smallAfterCanvasContext, afterImages);
            });

            init(beforeImageSources, beforeImages, smallBeforeCanvasContext, bigBeforeCanvasContext);
            init(afterImageSources, afterImages, smallAfterCanvasContext, bigAfterCanvasContext);

            //mobile and desktop small view port
            navOnMobile();
            
            if (isMobile()) {
                handleEventOnMobile();      
            } else {
                handleEventOnDesktop();
            }

            function handleEventOnMobile() {
                // tap position in before image and after image
                var beforeXY = {
                    x: null,
                    y: null
                },
                afterXY = {
                    x: null,
                    y: null
                };

                
                $(smallBeforeCanvas).mousemove(function(evt){
                    //reset after image interaction
                    afterXY.x = afterXY.y = null;
                    zoomOnMobile(evt, smallBeforeCanvas, bigBeforeCanvas, beforeImages, beforeXY);
                });
                $(smallAfterCanvas).mousemove(function(evt){
                    //reset before image interaction
                    beforeXY.x = beforeXY.y = null;
                    zoomOnMobile(evt, smallAfterCanvas, bigAfterCanvas, afterImages, afterXY);
                });

            }

            function zoomOnMobile(evt, smallCanvas, bigCanvas, images, previousXY) {
                if (zoomLevel < 1) {
                    return;
                }
                var smallCanvasContext = smallCanvas.getContext("2d");
                var previousX = previousXY.x;
                var previousY = previousXY.y;

                var rect = smallCanvas.getBoundingClientRect();
                var x = evt.clientX - rect.left;
                var y = evt.clientY - rect.top;

                //tap in same square -> turn off zoom
                if ( 
                    previousX &&
                    previousY &&
                    (x < (previousX + zoomWidth/2)) && 
                    (x > (previousX - zoomWidth/2)) && 
                    (y < (previousY + zoomWidth/2)) && 
                    (y > (previousY - zoomWidth/2))
                ) {
                    previousXY.x = null;
                    previousXY.y = null;
                    drawSmallImages(smallCanvasContext, images);
                } 
                //zoom
                else {
                    previousXY.x = x;
                    previousXY.y = y;
                    zoom(smallCanvas, bigCanvas, images, x, y);
                }
                return previousXY;      
            }

            function handleEventOnDesktop() {
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
                    if (zoomLevel < 1) {
                        return;
                    }

                    mouseOutBefore = false;

                    var rect = smallBeforeCanvas.getBoundingClientRect();
                    var x = evt.clientX - rect.left;
                    var y = evt.clientY - rect.top;

                    zoom(smallBeforeCanvas, bigBeforeCanvas, beforeImages, x, y);
                    zoom(smallAfterCanvas, bigAfterCanvas, afterImages, x, y);
                });

                $elem.find('#smallAfterCanvas').mousemove(function(evt){
                    if (zoomLevel < 1) {
                        return;
                    }

                    mouseOutAfter = false;

                    var rect = smallAfterCanvas.getBoundingClientRect();
                    var x = evt.clientX - rect.left;
                    var y = evt.clientY - rect.top;

                    zoom(smallBeforeCanvas, bigBeforeCanvas, beforeImages, x, y);
                    zoom(smallAfterCanvas, bigAfterCanvas, afterImages, x, y);
                });                
            }

            /* calculate size of canvas, zoom ratio, zoom viewport width when resize window*/
            function resize() {
                size = $elem.find('.square-container').first().width();
                //looks like node has attach to dom yet so we don't have dimension now
                //then use predefine one
                //Fixme: need to get size after render in dom
                if (!(size > 0)) {
                    if (isMobile()) {
                        size = 299;
                    } else {
                        size = 380;    
                    }                    
                }                
                tileViewSize = size/2;
                zoomLevel = tileRealSize/tileViewSize;
                zoomWidth = tileViewSize;
                $(smallBeforeCanvas).attr('width', size).attr('height', size);
                $(smallAfterCanvas).attr('width', size).attr('height', size);                
            }


            //find <img> in imageContainer, extract <img>'s source to imageSources
            function extractImageSource(imageSources, imageContainer) {
                if ($(imageContainer).find('img').length == 0) {
                    console.error('There is no before images');
                }
                $.each($(imageContainer).find('img'), function(index, value){
                    imageSources.push($(value).attr('src'));
                });

            }

            /* zoom by draw the right part of original image on top of smaller one */
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

            /* combine images for before/after images, use for first load */
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
                if (images.length == 4) {
                    context.drawImage(images[0], 0, 0, tileRealSize, tileRealSize, 0, 0, tileViewSize, tileViewSize);
                    context.drawImage(images[1], 0, 0, tileRealSize, tileRealSize, tileViewSize, 0, tileViewSize, tileViewSize);
                    context.drawImage(images[2], 0, 0, tileRealSize, tileRealSize, 0, tileViewSize, tileViewSize, tileViewSize);
                    context.drawImage(images[3], 0, 0, tileRealSize, tileRealSize, tileViewSize, tileViewSize, tileViewSize, tileViewSize);                    
                } else if (images.length == 1) {
                    context.drawImage(images[0], 0, 0, tileRealSize * 2, tileRealSize * 2, 0, 0, tileViewSize * 2, tileViewSize * 2);
                } else {
                    console.error('Number of child images for before or after image should be 1 or 4')
                }
            }

            function drawBigImages(context, images) {
                if (images.length == 4) {
                    context.drawImage(images[0], 0, 0, tileRealSize, tileRealSize, 0, 0, tileRealSize, tileRealSize);
                    context.drawImage(images[1], 0, 0, tileRealSize, tileRealSize, tileRealSize, 0, tileRealSize, tileRealSize);
                    context.drawImage(images[2], 0, 0, tileRealSize, tileRealSize, 0, tileRealSize, tileRealSize, tileRealSize);
                    context.drawImage(images[3], 0, 0, tileRealSize, tileRealSize, tileRealSize, tileRealSize, tileRealSize, tileRealSize);
                } else if (images.length == 1) {
                    context.drawImage(images[0], 0, 0, tileRealSize * 2, tileRealSize * 2, 0, 0, tileRealSize * 2, tileRealSize * 2);
                } else {
                    console.error('Number of child images for before or after image should be 1 or 4')
                }                
            }

            function navOnMobile()
            {
                $elem.find('nav.mobile-tab .nav-item').click(function(){
                    //show / hide tab
                    var target = $(this).attr('data-target');
                    $("." + target).show();
                    $.each($elem.find('nav.mobile-tab .nav-item').not(this), function(index, value){
                        var target = $(value).attr('data-target');
                        $("." + target).hide();
                    });

                    // active nav item
                    $(this).addClass('active');
                    $.each($elem.find('nav.mobile-tab .nav-item').not(this), function(index, value){
                        $(value).removeClass('active');
                    });
                });
            }

            //fixme: using Modernizr.touchevents. Can't load Modernizr script now
            function isMobile() {
                if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
                    return true;
                }
                return false;
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