/* Declare Global Variables Here */
var JQGRID_ROWNUM   = '10';
var JQGRID_ROWLIST  = new Array("10","20","30"); 
var JQGRID_WIDHT    = '1000';
var JQGRID_HEIGHT   = '300';
var DATE_PICKER_DATE_FORMAT = "dd-mm-yyyy";
function checknum(e){
	evt=e || window.event;
	var keypressed=evt.which || evt.keyCode;
	if(keypressed == 37 || keypressed == 39){
		return false; 
	}
	if(keypressed!="8" &&  keypressed!="9" && keypressed!="37" && keypressed!="39" && keypressed!="45" && keypressed!="46" && keypressed!="48" &&  keypressed!="49" && keypressed!="50" && keypressed!="51" && keypressed!="52" && keypressed!="53" && keypressed!="54" && keypressed!="55" && keypressed!="56" && keypressed!="57"){
 		return false;
	}	return true;
}
function alphaOnly(evt) {
		 var keyCode = (evt.which) ? evt.which : evt.keyCode;
		 //var valid = (keyCode >= 48 && keyCode <= 57) || (keyCode >= 65 && e.which <= 90) || (keyCode >= 97 && keyCode <= 122 || keyCode == 32 || keyCode == 95 || keyCode == 8);
			//alert(keyCode);
			if(keyCode == 37 || keyCode == 39){
				return false; 
			}
			if ((keyCode < 65 || keyCode > 90) && (keyCode < 97 || keyCode > 122) && keyCode != 32 && keyCode != 8 && keyCode != 9 && keyCode != 37 && keyCode != 39)
						return false; 
		 return true;
		
}
/*function checkalphanum(e){
	evt		=	e || window.event;
	var k	=	evt.which || evt.keyCode;
	var kArr=	Array("8", "9", "37", "39", "45", "46", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57");
	
	if(keypressed!="8" &&  keypressed!="9" && keypressed!="37" && keypressed!="39" && keypressed!="45" && keypressed!="46" && keypressed!="48" &&  keypressed!="49" && keypressed!="50" && keypressed!="51" && keypressed!="52" && keypressed!="53" && keypressed!="54" && keypressed!="55" && keypressed!="56" && keypressed!="57"){
 		return false;
	}	return true;
}*/

function alertmessage(msg, msgtype){
	/*if(msgtype == 'success'){
		$("body").append('<div class="custom-alert successbox new_success">'+msg+'</div>');
		$(".new_success").click(function(event) {
			$(".new_success").fadeOut();
			setTimeout('$(".new_success").remove();', 1000);
		});
	}*/

	if(msgtype == 'error'){
		$("body").append('<div class="custom-alert errorbox new_success">'+msg+'</div>');
		$(".new_success").click(function(event) {
			$(".new_success").fadeOut();
			setTimeout('$(".new_success").remove();', 1000);
		});
	}

	setTimeout('$(".new_success").fadeOut();', 5000);
	setTimeout('$(".new_success").remove();', 6000);
}

function trim(str) 
{
	return str.replace(/^\s+|\s+$/g,"");
}

function check_check(){
	var chkchkstat = true;
	for(var i=1; document.getElementById('check'+i); i++){
		if(document.getElementById('check'+i).checked == false){
			chkchkstat = false;			
			break;
		} 
	}	
	//alert(chkchkstat);
	if(chkchkstat == false){
		$('#del').html('');
		document.getElementById('deletechk').checked = false;		
	} else {
		document.getElementById('deletechk').checked = true;		
	}
	return true;
}

//alert(looplimit);
function checkall(This){
	//alert("j");
	if(This.checked==true){
		for(var i=1; document.getElementById('check'+i); i++){
			document.getElementById('check'+i).checked = true;
		}		
	} else {
		for(var i=1; document.getElementById('check'+i); i++){
			document.getElementById('check'+i).checked = false;
		}				
	}
	//alert(This.checked);
}

//pre load images
function simplePreload()
{ 
  var args = simplePreload.arguments;
  document.imageArray = new Array(args.length);
  for(var i=0; i<args.length; i++)
  {
    document.imageArray[i] = new Image;
    document.imageArray[i].src = args[i];
  }
}
function preload(arrayOfImages) {
    $(arrayOfImages).each(function(){
        $('<img/>')[0].src = this;
        // Alternatively you could use:
        // (new Image()).src = this;
    });
}
function getHeightWidth(type)
{
	type = type.toLowerCase();
	var viewportwidth;
	var viewportheight;
	// the more standards compliant browsers (mozilla/netscape/opera/IE7) use window.innerWidth and window.innerHeight 
	if (typeof window.innerWidth != 'undefined'){
		viewportwidth = window.innerWidth,
		viewportheight = window.innerHeight
	}
	// IE6 in standards compliant mode (i.e. with a valid doctype as the first line in the document)
	else if (typeof document.documentElement != 'undefined'   && typeof document.documentElement.clientWidth != 'undefined' && document.documentElement.clientWidth != 0){
		viewportwidth = document.documentElement.clientWidth;
		viewportheight = document.documentElement.clientHeight;
	} 
	// older versions of IE 
	else {
		viewportwidth = document.getElementsById('bodyid').clientWidth;
		viewportheight = document.getElementsById('bodyid').clientHeight;
	}
	if(type=='height'){
		var return_data = viewportheight;
	} else if (type=='width'){
		var return_data = viewportwidth;  
	} else if (type=='' || type=='undefined'){
		var return_data = viewportwidth+','+viewportheight;  
	}
	return return_data;
}

function parseScript(strcode) {
/* www.webdeveloper.com */
  var scripts = new Array();         // Array which will store the script's code
  
  // Strip out tags
  while(strcode.indexOf("<script") > -1 || strcode.indexOf("</script") > -1) {
    var s = strcode.indexOf("<script");
    var s_e = strcode.indexOf(">", s);
    var e = strcode.indexOf("</script", s);
    var e_e = strcode.indexOf(">", e);
    
    // Add to scripts array
    scripts.push(strcode.substring(s_e+1, e));
    // Strip from strcode
    strcode = strcode.substring(0, s) + strcode.substring(e_e+1);
  }
  
  // Loop through every script collected and eval it
  for(var i=0; i<scripts.length; i++) {
    try {
      eval(scripts[i]);
    }
    catch(ex) {
      // do what you want here when a script fails
    }
  }
}

function HideInformation(){
		$( "#alert" ).fadeOut("slow");
	}
	
	function successalert()
	{
		$("#flashMsg").html('<div class="alert alert-success" id="alert"><button data-dismiss="alert" class="close" type="button">×</button><div id="sccImg"></div><b>Success !</b>&nbsp;The record saved successfully.</div>');
		hideLoading();
		timeout = setTimeout("HideInformation();", 10000);
	}
	
	function erroralert()
	{
		$("#flashMsg").html('<div class="alert alert-error" id="alert"><button data-dismiss="alert" class="close" type="button">×</button><div id="errImg"></div><b>Error! </b>&nbsp;The record could not be saved. Please, try again.</div>');
		hideLoading();
		setTimeout("HideInformation();", 10000);
	}
	
	function showmessage(msg, i){
		if(i=="1"){
			$("#flashMsg").html('<div class="alert alert-success" id="alert"><button data-dismiss="alert" class="close" type="button">×</button><div id="sccImg"></div>'+msg+'</div>');
		}
		
		if(i=="2"){
			$("#flashMsg").html('<div class="alert alert-error" id="alert"><button data-dismiss="alert" class="close" type="button">×</button><div id="errImg"></div>'+msg+'</div>');
		}
		
		if(i=="3"){
			$("#flashMsg").html('<div class="alert alert-info" id="alert"><button data-dismiss="alert" class="close" type="button">×</button><div id="InfoImg"></div>'+msg+'</div>');
		}
		
		if(i=="4"){
			$("#flashMsg").html('<div class="alert" id="alert"><button data-dismiss="alert" class="close" type="button">×</button><div id="warnImg"></div>'+msg+'</div>');
		}	clearTimeout(timeout);	setTimeout("HideInformation();", 10000);
	}
	
	function hideLoading(){
		$(".loadingDiv").hide("slow");
	}


    function showErrorNotification(msg){
        var alert = '<div class="alert"><button type="button" class="close" data-dismiss="alert">&times;</button><strong>Warning!</strong> Test Alert.</div>';
        $.blockUI({ 
            centerY: 0,
            message: alert,
            showOverlay: false,
            timeout:  99999999999999,
            css: { top: '10px', left: '', right: '10px'},
            baseZ: 1010
        });
    }

  function strip_tags(input, allowed) {
	  allowed = (((allowed || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('');
	  var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
	  return input.replace(commentsAndPhpTags, '').replace(tags, function($0, $1) {
	  	return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
	  });
	}

$(function(){
	//hide message box
	setTimeout('$(".alert, .custom-alert").slideUp(1000);', 10000);
	$(".alert, .custom-alert").click(function(){
		$(this).slideUp("slow");
	});
	//start recaptcha
	$('#reload_captcha').click(function(){
	  $('#reload_captcha').attr('src',APPLICATION_URL+'img/loading.gif?y='+Math.random()*1000);
      $.ajax({ url: APPLICATION_URL + 'Pages/get_captcha_image',
        type: "POST",
        data: ({rand : (Math.random()*1000)}),
        success: function(data){  
          // alert(data);
          $('#security_image').attr('src', APPLICATION_URL+'images/captcha/captcha.jpg?y='+Math.random()*1000);
          $('#reload_captcha').attr('src',APPLICATION_URL+'img/refresh.png?y='+Math.random()*1000);
      }});
    });
    $('#reload_captcha').trigger('click');
    //end recaptcha

    $('[data-toggle="popover"]').popover();
});

var isMobile = {
    Android: function() {
        return navigator.userAgent.match(/Android/i);
    },
    BlackBerry: function() {
        return navigator.userAgent.match(/BlackBerry/i);
    },
    iOS: function() {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i);
    },
    Opera: function() {
        return navigator.userAgent.match(/Opera Mini/i);
    },
    Windows: function() {
        return navigator.userAgent.match(/IEMobile/i);
    },
    any: function() {
        return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
    }
};
		

