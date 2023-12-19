$(document).ready(function () {
    function displayLoading() {
        $('section#loading').css('display', 'flex');
        $('div.throbber-container').css('display', 'flex');
        $('div.throbber').css('display', 'block');
        $('div.throbber').css('display', 'block');
        $('p').css('display', 'block');
        $('span.dot').css('display', 'inline-block');
    }

    function hideLoading() {
        $('section#loading').css('display', 'none');
        $('div.throbber-container').css('display', 'none');
        $('div.throbber').css('display', 'none');
        $('div.throbber').css('display', 'none');
        $('p').css('display', 'none');
        $('span.dot').css('display', 'none');
    }

    $('#process').click(function () {
        $('#global-groups').remove();
        $('#subject-groups').remove();
        $('#controls').remove();
        displayLoading();
        const url = $('#timeTableURL').val();
        $.get(`/get-data?url=${encodeURIComponent(url)}`, function (data) {
            hideLoading();
            $('.form-container').append(data);
            $('#timeTableURL').val(url);
        });
    });

    $(document).on('click', '#createLink', function () {
        let selectedGlobalGroups = [];
        $('#global-groups input[type=checkbox]:checked').each(function () {
            selectedGlobalGroups.push($(this).next('label').text());
        });

        let selectedSubjectGroups = {};
        $('#subject-groups select').each(function () {
            let subject = $(this).prev('label').text();
            let selectedGroup = $(this).children('option:selected').text();
            selectedSubjectGroups[subject] = selectedGroup;
        });
        $.ajax({
            url: '/filter-data',
            type: 'POST',
            data: JSON.stringify({ globalGroups: selectedGlobalGroups, subjectGroups: selectedSubjectGroups }),
            contentType: 'application/json',
            success: function (data) {
                $('#personal-link').val(data.id);
            }
        });
        $(this).prop('disabled', true).css('background-color', '#ab67cb');
    });
});