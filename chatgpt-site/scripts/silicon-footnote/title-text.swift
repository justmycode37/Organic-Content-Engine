import Foundation
import Vision

// Coordinates are normalized to the visible, center-cropped news frame.
let paths = try JSONDecoder().decode([String].self, from: FileHandle.standardInput.readDataToEndOfFile())
let result = try paths.map { path -> [[CGFloat]] in
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([request])
    return (request.results ?? []).compactMap { observation in
        guard let text = observation.topCandidates(1).first,
              text.confidence >= 0.45,
              text.string.contains(where: { $0.isLetter || $0.isNumber }) else { return nil }
        let box = observation.boundingBox
        return [box.minX, 1 - box.maxY, box.maxX, 1 - box.minY]
    }
}
FileHandle.standardOutput.write(try JSONEncoder().encode(result))
