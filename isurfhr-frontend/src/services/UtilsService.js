import API from "./axios";

export const getEnums = async () => {
    return await API.get("/utils/enums");
}