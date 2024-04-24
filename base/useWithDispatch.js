import {useDispatch} from "react-redux";
import {bindActionCreators} from "@reduxjs/toolkit";


export default function useWithDispatch(slice){
    const dispatch = useDispatch();
    return bindActionCreators(slice.actions, dispatch);
}