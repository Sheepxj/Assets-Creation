package com.sheepxj.assets.system;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SystemMapper {
    @Select("SELECT 1")
    int ping();
}
