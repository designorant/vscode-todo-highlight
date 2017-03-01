var vscode = require('vscode');
var window = vscode.window;
var workspace = vscode.workspace;

var DEFAULT_KEYWORDS = {
    "TODO:": {
        text: "TODO:",
        color: '#fff',
        backgroundColor: '#ffbd2a',
        overviewRulerColor: 'rgba(255,189,42,0.8)'
    },
    "FIXME:": {
        text: "FIXME:",
        color: '#fff',
        backgroundColor: '#f06292',
        overviewRulerColor: 'rgba(240,98,146,0.8)'
    }
};

var DEFAULT_STYLE = {
    color: "#0000ff",
    backgroundColor: "yellow",
};

function getAssembledData(setting, customDefaultStyle, isCaseSensitive) {
    let result = JSON.parse(JSON.stringify(DEFAULT_KEYWORDS));
    setting.forEach((v) => {
        v = typeof v == 'string' ? { text: v } : v;
        let text = v.text;
        if (!text) return;//NOTE: in case of the text is empty or note set in configuration file
        if (!isCaseSensitive) {
            text = text.toUpperCase();
        }
        result[text] = Object.assign({}, DEFAULT_STYLE, customDefaultStyle, v);
    })

    return result;
}

function chooseAnnotationType(availableAnnotationTypes) {
    return window.showQuickPick(availableAnnotationTypes, {});
}

function searchAnnotations(workspaceState, annotationType, availableAnnotationTypes, callback, tokenSource) {

    var settings = workspace.getConfiguration('todohighlight');
    var includePattern = settings.get('include');
    var excludePattern = settings.get('exclude');

    var limitationForSearch = 5120;
    var isCaseSensitive = settings.get('isCaseSensitive');

    var statusMsg = `searching ${annotationType}...`;
    if (annotationType == 'ALL') {
        statusMsg = `searching all annotations...`;
    }

    setStatusMsg(statusMsg);

    workspace.findFiles(includePattern, excludePattern, limitationForSearch, tokenSource.token).then(function (files) {

        if (!files || files.length === 0) {
            callback({ message: 'no files' });
            return;
        }

        var annotations = {},
            annotationList = [];
        var times = 0;
        var patternOption = 'gi';
        if (isCaseSensitive) {
            patternOption = 'g';
        }
        var pattern = annotationType;
        if (annotationType == 'ALL') {
            availableAnnotationTypes.shift();//remove the very first `ALL` item
            pattern = availableAnnotationTypes.join('|');
        }
        var regexp = new RegExp(pattern, patternOption);

        for (var i = 0; i < files.length; i++) {
            workspace.openTextDocument(files[i]).then(function (file) {
                searchAnnotationInFile(file, annotations, annotationList, regexp);
                times++;
                if (times === files.length) {
                    workspaceState.update('annotationList', annotationList)
                    callback(null, annotationType, annotations, annotationList);
                }
            }, function (err) {
                errorHandler(err);
            });
        }
    }, function (err) {
        errorHandler(err);
    });
}

function searchAnnotationInFile(file, annotations, annotationList, regexp) {
    var fileInUri = file.uri.toString();
    var pathWithoutFile = fileInUri.substring(7, fileInUri.length);

    for (var line = 0; line < file.lineCount; line++) {
        var lineText = file.lineAt(line).text;
        var match = lineText.match(regexp);
        if (match !== null) {
            if (!annotations.hasOwnProperty(pathWithoutFile)) {
                annotations[pathWithoutFile] = [];
            }
            var content = getContent(lineText, match);
            var locationInfo = getLocationInfo(pathWithoutFile, lineText, line, match);

            var annotation = {
                // description: locationInfo.location,
                label: content,
                detail: locationInfo.location,
                lineNum: line,
                fileName: locationInfo.fileName,
                startCol: locationInfo.startCol,
                endCol: locationInfo.endCol
            };
            annotationList.push(annotation);
            annotations[pathWithoutFile].push(annotation);
        }
    }
}

function annotationsFound(err, annotationType, annotations, annotationList) {
    if (err) {
        console.log('todohighlight err:', err);
        setStatusMsg('0');
        return;
    }

    var resultNum = annotationList.length;
    var tooltip = resultNum + ' ' + annotationType + '(s) found';
    if (annotationType == 'ALL') {
        tooltip = resultNum + ' annotation(s) found';
    }
    setStatusMsg(resultNum, tooltip);

    if (annotationList.length === 0) {
        window.showInformationMessage('No Results.');
        return;
    }

    showOutputChannel(annotationList);

    // window.showQuickPick(annotationList, {}).then(function (response) {
    //     if (!response) return;
    //     var nameSplit = String(response.fileName);
    //     var file = 'file://' + nameSplit;
    //     var fileUri = vscode.Uri.parse(file);
    //     workspace.openTextDocument(fileUri).then(function (textDocument) {
    //         window.showTextDocument(textDocument, vscode.ViewColumn.One).then(function (textEditor) {
    //             var lineNum = response.lineNum;
    //             var resultObjects = annotations[nameSplit];
    //             var startPos;
    //             var endPos;
    //             for (var i = 0; i < resultObjects.length; i++) {
    //                 var object = resultObjects[i];
    //                 if (object.lineNum === lineNum) {
    //                     startPos = new vscode.Position(object.lineNum, response.startCol);
    //                     endPos = new vscode.Position(object.lineNum, response.endCol);
    //                     break;
    //                 }
    //             }
    //             var newSelection = new vscode.Selection(startPos, endPos);
    //             window.activeTextEditor.selection = newSelection;
    //             window.activeTextEditor.revealRange(newSelection, vscode.TextEditorRevealType.Default);
    //         }, function (err) {
    //             errorHandler(err);
    //         });
    //     }, function (err) {
    //         errorHandler(err);
    //     });
    // }, function (err) {
    //     errorHandler(err);
    // });

}

function showOutputChannel(data) {
    if (!window.outputChannel) return;

    window.outputChannel.clear();
    data.forEach(function (v, i, a) {
        window.outputChannel.appendLine(v.fileName + ':' + (v.lineNum + 1) + ':' + (v.startCol + 1));
        window.outputChannel.appendLine(v.label + '\n');
    });
    window.outputChannel.show();
}

function initialSearchCallback(err, annotationType, annotations, annotationList) {
    if (err) {
        console.log(err);
        setStatusMsg('');
        return;
    }

    var resultNum = annotationList.length;
    var tooltip = resultNum + ' ' + annotationType + '(s) found';
    if (annotationType == 'ALL') {
        tooltip = resultNum + ' annotation(s) found';
    }
    setStatusMsg(resultNum, tooltip);
}


function getContent(lineText, match) {
    return lineText.substring(lineText.indexOf(match[0]), lineText.length);
};

function getLocationInfo(pathWithoutFile, lineText, line, match) {
    var rootPath = workspace.rootPath + '/';
    var outputFile = pathWithoutFile.replace(rootPath, '');
    var startCol = lineText.indexOf(match[0]);
    var endCol = lineText.length;
    var location = outputFile + ' ' + (line + 1) + ':' + (startCol + 1);

    return {
        fileName: pathWithoutFile,
        location: location,
        startCol: startCol,
        endCol: endCol
    };
};

function createStatusBarItem() {
    var statusBarItem = window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.text = '$(checklist)' + '0';
    statusBarItem.tooltip = 'List annotations';
    statusBarItem.command = 'todohighlight.showOutputChannel';
    return statusBarItem;
};

function errorHandler(err) {
    setStatusMsg('0');
    console.log('todohighlight err:', err);
}

function setStatusMsg(msg, tooltip) {
    if (window.statusBarItem) {
        window.statusBarItem.text = '$(checklist)' + (msg || '');
        tooltip && (window.statusBarItem.tooltip = tooltip);
        window.statusBarItem.show();
    }
}

module.exports = {
    getAssembledData,
    chooseAnnotationType,
    searchAnnotations,
    annotationsFound,
    createStatusBarItem,
    setStatusMsg,
    initialSearchCallback,
    showOutputChannel
};

