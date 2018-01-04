(function ($) {
    "use strict";
    var copy = function (a) {
        return Array.prototype.slice.call(a);
    };

    /**
     Handle a sequence of methods, stopping on failure by default
     @param Array<Function> chain    List of methods to execute.  Non-deferred return values will be treated as successful deferreds.
     @param Boolean  continueOnFailure   Continue executing even if one of the returned deferreds fails.
     @returns Deferred
     */
    $.sequence = function (chain, continueOnFailure) {
        var handleStep, handleResult,
            steps = copy(chain),
            def = new $.Deferred(),
            defs = [],
            results = [];
        handleStep = function () {
            if (!steps.length) {
                def.resolveWith(defs, [ results ]);
                return;
            }
            var step = steps.shift(),
                result = step();
            handleResult(
                $.when(result).always(function () {
                    defs.push(this);
                }).done(function () {
                    results.push({ resolved: copy(arguments) });
                }).fail(function () {
                    results.push({ rejected: copy(arguments) });
                })
            );
        };
        handleResult = continueOnFailure ?
            function (result) {
                result.always(function () {
                    handleStep();
                });
            } :
            function (result) {
                result.done(handleStep)
                    .fail(function () {
                        def.rejectWith(defs, [ results ]);
                    });
            };
        handleStep();
        return def.promise();
    };
}(jQuery));