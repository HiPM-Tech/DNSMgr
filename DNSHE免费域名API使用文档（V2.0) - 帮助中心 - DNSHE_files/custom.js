$("#menu-toggle").click(function(e) {
    e.preventDefault();
    $("#wrapper").toggleClass("toggled");

});
$("#menu-toggle-2").click(function(e) {
    e.preventDefault();
    $("#wrapper").toggleClass("toggled-2");
    $('#footer').toggleClass('footer_margin');
    $('#menu ul').hide();
});

$("#sidebar-wrapper").click(function (e) {

    if ($(window).width() <= 1199) {
        $("#wrapper").addClass("toggled-2");
        $('#footer').addClass('footer_margin');
    }
});

$("#page-content-wrapper").click(function(e) {
    $("#wrapper").removeClass("toggled-2");
    $('#footer').removeClass('footer_margin');
});



function initMenu() {
    $('#menu ul').hide();
    $('#menu ul').children('.current').parent().show();
    //$('#menu ul:first').show();
    $('#menu li a').click(
        function() {
            var checkElement = $(this).next();
            if ((checkElement.is('ul')) && (checkElement.is(':visible'))) {
                return false;
            }
            if ((checkElement.is('ul')) && (!checkElement.is(':visible'))) {
                $('#menu ul:visible').slideUp('normal');
                checkElement.slideDown('normal');

                return false;
            }
        }
    );
}
$(document).ready(function() {
    initMenu();
});