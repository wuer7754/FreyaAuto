const rotationService = require(
    "../automations/description-rotation.service"
);

function getErrorMessage(error, fallback) {
    return error.message || fallback;
}

async function getDescriptionRotation(req, res) {
    try {
        return res.json(rotationService.getPublicConfig());
    } catch (error) {
        console.error("Get description rotation error:", error.message);
        return res.status(500).json({
            success: false,
            error: getErrorMessage(
                error,
                "Failed to load weekly rotation settings."
            ),
        });
    }
}

async function updateDescriptionRotation(req, res) {
    try {
        const config = rotationService.updateConfig(req.body || {});
        return res.json({
            success: true,
            config,
        });
    } catch (error) {
        console.error("Update description rotation error:", error.message);
        return res.status(400).json({
            success: false,
            error: getErrorMessage(
                error,
                "Failed to save weekly rotation settings."
            ),
        });
    }
}

module.exports = {
    getDescriptionRotation,
    updateDescriptionRotation,
};
