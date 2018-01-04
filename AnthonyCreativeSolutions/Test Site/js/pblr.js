/*
@brief pebblar landing page js
@file pblr.js
@author	JL
@copyright Copyright(c) 2017 pebblar
@ver 1.0
*/
$(document).ready(function() {
    // show hide subnav depending on scroll direction
    var position = $(window).scrollTop();
	var pblrnavbar = $("#navbartop");

    $(window).scroll(function () {
        var scroll = $(window).scrollTop();
        var $topEntryArea = $("#top_entry_area");
        var $cntrEntryArea = $("#cntr_entry_area");

		if ($cntrEntryArea.isOnScreen()) {
		    if (!$topEntryArea.is(':hidden')) {
		        $('form').each(function (i, el) {
                    el.reset();
                });
            }

            $topEntryArea.hide();
		} else {
            if ($topEntryArea.is(':hidden')) {
                $('form').each(function (i, el) {
                    el.reset();
                });
            }

            $topEntryArea.show();
		}

        position = scroll;
    });

    $.fn.isOnScreen = function(){

	    var win = $(window);

	    var viewport = {
	        top : win.scrollTop()+pblrnavbar.outerHeight( false ),
	        left : win.scrollLeft()
	    };

	    viewport.right = viewport.left + win.width();
	    viewport.bottom = viewport.top + win.height();

	    var bounds = this.offset();
	    bounds.right = bounds.left + this.outerWidth();
	    bounds.bottom = bounds.top + this.outerHeight();

	    return (!(viewport.right < bounds.left || viewport.left > bounds.right || viewport.bottom < bounds.top || viewport.top > bounds.bottom));
	};

    var body = document.getElementsByTagName('body')[0];
    var bodyScrollTop = null;
    var locked = false;

    function toogleFixedTop() {
        $('#navbartop')
            .toggleClass('fixed-top')
            .toggleClass('fixed-top-height');
        $(body).toggleClass('pt-0');
        $('.content .container, main, footer').toggle();
        $('html, body').height('100%');
    }

    $(body).on('click', '.navbar-toggler', function() {
        if (!locked) {
            bodyScrollTop = (typeof window.pageYOffset !== 'undefined') ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
            toogleFixedTop();
            locked = true;
        } else {
            toogleFixedTop();
            window.scrollTo(0, bodyScrollTop);
            locked = false;
        }
    });
});